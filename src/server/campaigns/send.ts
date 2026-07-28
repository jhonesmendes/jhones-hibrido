import { eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { publish } from "@/server/events/bus";
import {
  getOrCreateContact,
  getOrCreateConversation,
} from "@/server/inbox/ingest";
import { sendText } from "@/server/inbox/send";
import { sendTemplate } from "@/server/whatsapp/templates";
import { getLiveStatus } from "@/server/baileys/manager";
import { renderMessage } from "@/lib/campaigns/render";
import { getCampaign } from "@/server/campaigns/queries";

export class CampaignSendError extends Error {
  code: "not_found" | "not_draft" | "not_sending" | "not_ready";
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
};

export function campaignSendErrorStatus(err: CampaignSendError): number {
  return CAMPAIGN_SEND_ERROR_STATUS[err.code];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Dispara la campaña: valida, marca "sending" y arranca el loop en segundo
 * plano (no espera a que termine — FR-007/data-model.md). */
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

  // FR-012: revalida el requisito del canal ANTES de arrancar, no a mitad del loop.
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
    const channel = await getLiveStatus(organizationId);
    if (channel.status !== "connected") {
      throw new CampaignSendError(
        "not_ready",
        "O canal não oficial não está mais conectado"
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
      const { contact } = await getOrCreateContact(
        organizationId,
        recipient.phone,
        null
      );
      const conversation = await getOrCreateConversation(
        organizationId,
        contact.id
      );

      let messageId: string;
      if (campaign.channel === "official") {
        const variables = (recipient.variables as Record<string, string>) ?? {};
        const result = await sendTemplate({
          organizationId,
          conversationId: conversation.id,
          templateId: campaign.templateId!,
          variable: variables["1"],
        });
        messageId = result.messageId;
      } else {
        if (conversation.channel !== "unofficial") {
          await db
            .update(schema.conversation)
            .set({ channel: "unofficial" })
            .where(eq(schema.conversation.id, conversation.id));
        }
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

    // Guardarraíl duro (Constitución IX v2.0.0): intervalo SIEMPRE configurable,
    // nunca fijo — se lee de la propia campaña, no de una constante.
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
