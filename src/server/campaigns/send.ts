import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { publish } from "@/server/events/bus";
import {
  getOrCreateContact,
  getOrCreateConversation,
  type ConversationChannel,
} from "@/server/inbox/ingest";
import { sendText } from "@/server/inbox/send";
import { sendTemplate } from "@/server/whatsapp/templates";
import { getCredentialsById, getCredentialsByOrg } from "@/server/whatsapp/credentials";
import {
  isAnyUnofficialChannelConnected,
  resolveDefaultUnofficialChannelId,
  resolveDepartmentUnofficialChannelId,
} from "@/server/settings/unofficial-channels";
import { renderMessage } from "@/lib/campaigns/render";
import { getCampaign } from "@/server/campaigns/queries";

/** Resolve o canal específico que a campanha usa pra criar/reusar a
 * conversa de cada destinatário — nunca "sticky"/mutado depois (era o bug:
 * campanha não oficial virava dona do canal de uma conversa oficial já
 * existente do contato). Oficial: número da WABA em que o modelo da
 * campanha foi registrado (uma org pode ter mais de uma WABA — usar sempre
 * "o número padrão" desalinhava a conversa do número que realmente envia).
 * Não oficial: canal do departamento da campanha, senão o padrão da org. */
async function resolveCampaignChannel(
  organizationId: string,
  campaign: {
    channel: "official" | "unofficial";
    departmentId: string | null;
    templateId: string | null;
  }
): Promise<ConversationChannel | null> {
  if (campaign.channel === "official") {
    const db = getDb();
    const templateCredentialId = campaign.templateId
      ? (
          await db
            .select({ credentialId: schema.template.credentialId })
            .from(schema.template)
            .where(eq(schema.template.id, campaign.templateId))
            .limit(1)
        )[0]?.credentialId
      : null;
    const credentials = templateCredentialId
      ? await getCredentialsById(templateCredentialId, organizationId)
      : await getCredentialsByOrg(organizationId);
    return credentials ? { type: "official", metaCredentialId: credentials.id } : null;
  }
  const departmentChannelId = campaign.departmentId
    ? await resolveDepartmentUnofficialChannelId(campaign.departmentId)
    : null;
  const unofficialChannelId =
    departmentChannelId ?? (await resolveDefaultUnofficialChannelId(organizationId));
  return unofficialChannelId ? { type: "unofficial", unofficialChannelId } : null;
}

export class CampaignSendError extends Error {
  code: "not_found" | "not_draft" | "not_sending" | "not_ready" | "in_progress";
  constructor(code: CampaignSendError["code"], message: string) {
    super(message);
    this.name = "CampaignSendError";
    this.code = code;
  }
}

const CAMPAIGN_SEND_ERROR_STATUS: Record<CampaignSendError["code"], number> = {
  not_found: 404,
  not_draft: 409,
  not_sending: 409,
  not_ready: 422,
  in_progress: 409,
};

export function campaignSendErrorStatus(err: CampaignSendError): number {
  return CAMPAIGN_SEND_ERROR_STATUS[err.code];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Dispara a campanha: valida, marca como "sending" e inicia o loop em segundo
 * plano (não espera terminar — FR-007/data-model.md). */
export async function startCampaign(
  organizationId: string,
  campaignId: string
): Promise<void> {
  const db = getDb();
  const campaign = await getCampaign(organizationId, campaignId);
  if (!campaign) throw new CampaignSendError("not_found", "Campanha não encontrada");
  if (campaign.status !== "draft") {
    throw new CampaignSendError(
      "not_draft",
      "Esta campanha já foi disparada ou está em outro estado"
    );
  }

  // FR-012: revalida o requisito do canal ANTES de iniciar, não no meio do loop.
  if (campaign.channel === "official") {
    if (!campaign.templateId) {
      throw new CampaignSendError("not_ready", "Campanha sem modelo associado");
    }
    const templates = await db
      .select()
      .from(schema.template)
      .where(eq(schema.template.id, campaign.templateId))
      .limit(1);
    if (templates[0]?.status !== "approved") {
      throw new CampaignSendError(
        "not_ready",
        "O modelo desta campanha não está mais aprovado"
      );
    }
  } else {
    const connected = await isAnyUnofficialChannelConnected(organizationId);
    if (!connected) {
      throw new CampaignSendError(
        "not_ready",
        "O WhatsApp Web não está mais conectado"
      );
    }
  }

  await db
    .update(schema.campaign)
    .set({ status: "sending", startedAt: new Date() })
    .where(eq(schema.campaign.id, campaignId));

  void runCampaign(organizationId, campaignId);
}

async function runCampaign(
  organizationId: string,
  campaignId: string
): Promise<void> {
  const db = getDb();

  for (;;) {
    const campaign = await getCampaign(organizationId, campaignId);
    if (!campaign) return;

    if (campaign.cancelRequested) {
      await finish(organizationId, campaignId, "cancelled");
      return;
    }

    const pending = await db
      .select()
      .from(schema.campaignRecipient)
      .where(
        sql`${schema.campaignRecipient.campaignId} = ${campaignId} and ${schema.campaignRecipient.status} = 'pending'`
      )
      .limit(1);
    const recipient = pending[0];
    if (!recipient) {
      await finish(organizationId, campaignId, "sent");
      return;
    }

    try {
      const channel = await resolveCampaignChannel(organizationId, campaign);
      if (!channel) {
        throw new Error(
          campaign.channel === "official"
            ? "Nenhum número oficial conectado"
            : "Nenhum canal WhatsApp Web conectado"
        );
      }

      const { contact } = await getOrCreateContact(
        organizationId,
        recipient.phone,
        null
      );
      const conversation = await getOrCreateConversation(
        organizationId,
        contact.id,
        channel,
        campaign.departmentId
      );

      let messageId: string;
      if (campaign.channel === "official") {
        const byIndex = (recipient.variables as Record<string, string>) ?? {};
        // Chaves "1","2",... na ordem — ver createCampaign (canal oficial).
        const maxIndex = Object.keys(byIndex).reduce(
          (max, k) => Math.max(max, Number(k) || 0),
          0
        );
        const variables = Array.from(
          { length: maxIndex },
          (_, i) => byIndex[String(i + 1)] ?? ""
        );
        const result = await sendTemplate({
          organizationId,
          conversationId: conversation.id,
          templateId: campaign.templateId!,
          variables,
        });
        messageId = result.messageId;
      } else {
        // `conversation` já nasceu (ou já existia) no canal correto — ver
        // resolveCampaignChannel/getOrCreateConversation acima. Nunca mais
        // se sobrescreve o canal de uma conversa existente aqui.
        const variables = (recipient.variables as Record<string, string>) ?? {};
        const text = renderMessage(campaign.messageTemplate ?? "", variables);
        const result = await sendText({
          conversationId: conversation.id,
          organizationId,
          text,
        });
        messageId = result.messageId;
      }

      await db
        .update(schema.campaignRecipient)
        .set({
          status: "sent",
          contactId: contact.id,
          conversationId: conversation.id,
          messageId,
        })
        .where(eq(schema.campaignRecipient.id, recipient.id));
      await db
        .update(schema.campaign)
        .set({ sent: sql`${schema.campaign.sent} + 1` })
        .where(eq(schema.campaign.id, campaignId));
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      await db
        .update(schema.campaignRecipient)
        .set({ status: "failed", error: reason })
        .where(eq(schema.campaignRecipient.id, recipient.id));
      await db
        .update(schema.campaign)
        .set({ failed: sql`${schema.campaign.failed} + 1` })
        .where(eq(schema.campaign.id, campaignId));
    }

    const progress = await getCampaign(organizationId, campaignId);
    if (progress) {
      publish(organizationId, {
        type: "campaign.run",
        data: {
          campaignId,
          status: progress.status,
          total: progress.total,
          sent: progress.sent,
          failed: progress.failed,
        },
      });
    }

    // Guardrail rígido (Constituição IX v2.0.0): intervalo SEMPRE configurável,
    // nunca fixo — é lido da própria campanha, não de uma constante.
    if (campaign.sendIntervalMs > 0) await sleep(campaign.sendIntervalMs);
  }
}

async function finish(
  organizationId: string,
  campaignId: string,
  status: "sent" | "cancelled"
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.campaign)
    .set({ status, completedAt: new Date() })
    .where(eq(schema.campaign.id, campaignId));
  const final = await getCampaign(organizationId, campaignId);
  if (final) {
    publish(organizationId, {
      type: "campaign.run",
      data: {
        campaignId,
        status: final.status,
        total: final.total,
        sent: final.sent,
        failed: final.failed,
      },
    });
  }
}

export async function cancelCampaign(
  organizationId: string,
  campaignId: string
): Promise<void> {
  const db = getDb();
  const campaign = await getCampaign(organizationId, campaignId);
  if (!campaign) throw new CampaignSendError("not_found", "Campanha não encontrada");
  if (campaign.status !== "sending") {
    throw new CampaignSendError(
      "not_sending",
      "Só é possível cancelar uma campanha em andamento"
    );
  }
  await db
    .update(schema.campaign)
    .set({ cancelRequested: true })
    .where(eq(schema.campaign.id, campaignId));
}

/** Exclui uma campanha criada errada (rascunho, agendada, cancelada ou já
 * concluída) — nunca uma em disparo ativo (cancele primeiro). Destinatários
 * são removidos em cascata (FK `campaign_recipient.campaign_id`). */
export async function deleteCampaign(
  organizationId: string,
  campaignId: string
): Promise<void> {
  const db = getDb();
  const campaign = await getCampaign(organizationId, campaignId);
  if (!campaign) throw new CampaignSendError("not_found", "Campanha não encontrada");
  if (campaign.status === "sending") {
    throw new CampaignSendError(
      "in_progress",
      "Cancele o disparo em andamento antes de excluir a campanha"
    );
  }
  await db.delete(schema.campaign).where(eq(schema.campaign.id, campaignId));
}
