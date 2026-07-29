import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { parseRecipientsCsv } from "@/lib/campaigns/csv";
import { extractVariables } from "@/lib/campaigns/render";
import { getLiveStatus } from "@/server/baileys/manager";
import { countVariables } from "@/server/whatsapp/templates";
import { serializeCampaign } from "@/server/campaigns/queries";

export class CampaignError extends Error {
  code:
    | "invalid"
    | "template_not_approved"
    | "channel_not_connected"
    | "no_recipients";

  constructor(code: CampaignError["code"], message: string) {
    super(message);
    this.name = "CampaignError";
    this.code = code;
  }
}

const CAMPAIGN_ERROR_STATUS: Record<CampaignError["code"], number> = {
  invalid: 422,
  template_not_approved: 422,
  channel_not_connected: 409,
  no_recipients: 422,
};

export function campaignErrorStatus(err: CampaignError): number {
  return CAMPAIGN_ERROR_STATUS[err.code];
}

type RecipientSource =
  | { source: "csv"; csvText: string }
  | {
      source: "crm";
      stageId?: string | null;
      /** Filtra pelo canal da CONVERSA do contato — independente do canal de envio da campanha. */
      originChannel?: "official" | "unofficial" | null;
      /** Contatos escolhidos manualmente na UI — unidos ao filtro acima. */
      contactIds?: string[];
    };

type CreateOfficialInput = {
  name: string;
  channel: "official";
  templateId: string;
  scheduledAt?: string | null;
} & RecipientSource;

type CreateUnofficialInput = {
  name: string;
  channel: "unofficial";
  messageTemplate: string;
  sendIntervalMs: number;
  riskAcknowledged: boolean;
  scheduledAt?: string | null;
} & RecipientSource;

export type CreateCampaignInput = CreateOfficialInput | CreateUnofficialInput;

type Recipient = { phone: string; variables: Record<string, string> };

/** Contatos do CRM (não arquivados) filtrados por etapa do pipeline e/ou canal
 * da conversa, com a opção de UNIR contatos escolhidos manualmente por id
 * (seleção individual na UI), independente do filtro. */
export async function resolveCrmContacts(
  organizationId: string,
  filter: {
    stageId?: string | null;
    channel?: "official" | "unofficial" | null;
    extraContactIds?: string[];
  }
): Promise<{ phone: string; name: string }[]> {
  const db = getDb();
  const conditions = [
    eq(schema.contact.organizationId, organizationId),
    isNull(schema.contact.archivedAt),
    filter.stageId ? eq(schema.lead.stageId, filter.stageId) : undefined,
    filter.channel ? eq(schema.conversation.channel, filter.channel) : undefined,
  ].filter((c) => c !== undefined);

  const rows = await db
    .select({ phone: schema.contact.phone, name: schema.contact.name })
    .from(schema.contact)
    .leftJoin(schema.lead, eq(schema.lead.contactId, schema.contact.id))
    .leftJoin(
      schema.conversation,
      and(
        eq(schema.conversation.contactId, schema.contact.id),
        eq(schema.conversation.isTest, false)
      )
    )
    .where(and(...conditions));

  const byPhone = new Map<string, { phone: string; name: string }>();
  for (const r of rows) byPhone.set(r.phone, r);

  if (filter.extraContactIds && filter.extraContactIds.length > 0) {
    const extraRows = await db
      .select({ phone: schema.contact.phone, name: schema.contact.name })
      .from(schema.contact)
      .where(
        and(
          eq(schema.contact.organizationId, organizationId),
          isNull(schema.contact.archivedAt),
          inArray(schema.contact.id, filter.extraContactIds)
        )
      );
    for (const r of extraRows) byPhone.set(r.phone, r);
  }

  return [...byPhone.values()];
}

/** Resolve os destinatários (CSV ou filtro de CRM) num formato comum. */
async function resolveRecipients(
  organizationId: string,
  input: CreateCampaignInput
): Promise<{
  validRows: Recipient[];
  invalidRows: { line: number; reason: string }[];
  csvVariableNames: string[];
}> {
  if (input.source === "csv") {
    const { validRows, invalidRows, variableNames } = parseRecipientsCsv(
      input.csvText
    );
    if (input.channel === "official") {
      return {
        validRows: validRows.map((row) => {
          const variables: Record<string, string> = {};
          row.variablesOrdered.forEach((v, i) => {
            variables[String(i + 1)] = v;
          });
          return { phone: row.phone, variables };
        }),
        invalidRows,
        csvVariableNames: variableNames,
      };
    }
    return {
      validRows: validRows.map((row) => ({
        phone: row.phone,
        variables: row.variables,
      })),
      invalidRows,
      csvVariableNames: variableNames,
    };
  }

  const contacts = await resolveCrmContacts(organizationId, {
    stageId: input.stageId,
    channel: input.originChannel ?? null,
    extraContactIds: input.contactIds,
  });
  return {
    validRows: contacts.map((c) => {
      const variables: Record<string, string> =
        input.channel === "official" ? { "1": c.name } : { nome: c.name };
      return { phone: c.phone, variables };
    }),
    invalidRows: [],
    csvVariableNames: [],
  };
}

export async function createCampaign(
  organizationId: string,
  input: CreateCampaignInput
) {
  const db = getDb();

  let templateVariableCount = 0;

  if (input.channel === "official") {
    const templates = await db
      .select()
      .from(schema.template)
      .where(
        scoped(
          schema.template.organizationId,
          organizationId,
          eq(schema.template.id, input.templateId)
        )
      )
      .limit(1);
    const template = templates[0];
    if (!template) {
      throw new CampaignError("invalid", "Modelo não encontrado");
    }
    if (template.status !== "approved") {
      throw new CampaignError(
        "template_not_approved",
        "Só é possível criar uma campanha oficial com um modelo aprovado"
      );
    }
    templateVariableCount = countVariables(template.body);
  } else {
    if (!input.riskAcknowledged) {
      throw new CampaignError(
        "invalid",
        "É preciso confirmar o aviso de risco de banimento para criar uma campanha pelo WhatsApp Web"
      );
    }
    if (!input.messageTemplate.trim()) {
      throw new CampaignError("invalid", "A mensagem não pode ficar vazia");
    }
    const channel = await getLiveStatus(organizationId);
    if (channel.status !== "connected") {
      throw new CampaignError(
        "channel_not_connected",
        "Conecte o WhatsApp Web em Configurações antes de criar esta campanha"
      );
    }
  }

  const { validRows, invalidRows, csvVariableNames } = await resolveRecipients(
    organizationId,
    input
  );
  if (validRows.length === 0) {
    throw new CampaignError(
      "no_recipients",
      "Nenhum destinatário válido encontrado"
    );
  }
  if (
    input.channel === "official" &&
    input.source === "csv" &&
    templateVariableCount > 0 &&
    csvVariableNames.length < templateVariableCount
  ) {
    throw new CampaignError(
      "invalid",
      `O modelo usa ${templateVariableCount} variável(is) ({{1}}${
        templateVariableCount > 1 ? ` a {{${templateVariableCount}}}` : ""
      }), mas o CSV só tem ${csvVariableNames.length} coluna(s) além do telefone`
    );
  }

  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
    throw new CampaignError("invalid", "Data de agendamento inválida");
  }

  const campaignId = newId("campaign");
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(schema.campaign).values({
      id: campaignId,
      organizationId,
      name: input.name,
      channel: input.channel,
      templateId: input.channel === "official" ? input.templateId : null,
      messageTemplate:
        input.channel === "unofficial" ? input.messageTemplate : null,
      // Oficial: intervalo curto por padrão (cortesia com a Graph API,
      // não há guardrail rígido como no não oficial). Não oficial: o que
      // o operador escolheu (FR-006, nunca fixo).
      sendIntervalMs:
        input.channel === "unofficial" ? input.sendIntervalMs : 1000,
      status: "draft",
      total: validRows.length,
      scheduledAt,
      createdAt: now,
    });

    await tx.insert(schema.campaignRecipient).values(
      validRows.map((row) => ({
        id: newId("campaignRecipient"),
        campaignId,
        organizationId,
        phone: row.phone,
        variables: row.variables,
      }))
    );
  });

  const campaigns = await db
    .select()
    .from(schema.campaign)
    .where(eq(schema.campaign.id, campaignId))
    .limit(1);

  return {
    campaign: serializeCampaign(campaigns[0]!),
    skippedRows: invalidRows,
  };
}

/** Nomes das variáveis detectadas em uma mensagem não oficial (para a UI do CSV). */
export function detectMessageVariables(messageTemplate: string): string[] {
  return extractVariables(messageTemplate);
}
