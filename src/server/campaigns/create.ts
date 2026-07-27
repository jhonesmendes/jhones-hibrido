import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { parseRecipientsCsv } from "@/lib/campaigns/csv";
import { extractVariables } from "@/lib/campaigns/render";
import { getChannelByOrg } from "@/server/unofficial/channel";
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

type CreateOfficialInput = {
  name: string;
  channel: "official";
  templateId: string;
  csvText: string;
};

type CreateUnofficialInput = {
  name: string;
  channel: "unofficial";
  messageTemplate: string;
  sendIntervalMs: number;
  riskAcknowledged: boolean;
  csvText: string;
};

export type CreateCampaignInput = CreateOfficialInput | CreateUnofficialInput;

export async function createCampaign(
  organizationId: string,
  input: CreateCampaignInput
) {
  const db = getDb();

  let templateVariableKey: string | null = null;

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
    // Acotamiento v1 del proyecto: como máximo la variable {{1}}.
    templateVariableKey = /\{\{\s*1\s*\}\}/.test(template.body) ? "1" : null;
  } else {
    if (!input.riskAcknowledged) {
      throw new CampaignError(
        "invalid",
        "É preciso confirmar o aviso de risco de banimento para criar uma campanha pelo canal não oficial"
      );
    }
    if (!input.messageTemplate.trim()) {
      throw new CampaignError("invalid", "A mensagem não pode ficar vazia");
    }
    const channel = await getChannelByOrg(organizationId);
    if (!channel) {
      throw new CampaignError(
        "channel_not_connected",
        "Conecte o canal não oficial em Configurações antes de criar esta campanha"
      );
    }
  }

  const { validRows, invalidRows, variableNames } = parseRecipientsCsv(
    input.csvText
  );
  if (validRows.length === 0) {
    throw new CampaignError(
      "no_recipients",
      "Nenhum destinatário válido encontrado no CSV"
    );
  }
  if (templateVariableKey && variableNames.length === 0) {
    throw new CampaignError(
      "invalid",
      "O modelo usa {{1}}, mas o CSV não tem uma coluna além do telefone para preenchê-la"
    );
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
      // Oficial: intervalo corto por defecto (cortesía con la Graph API,
      // no hay guardrail duro como en el no oficial). No oficial: el que
      // eligió el operador (FR-006, nunca fijo).
      sendIntervalMs:
        input.channel === "unofficial" ? input.sendIntervalMs : 1000,
      status: "draft",
      total: validRows.length,
      createdAt: now,
    });

    await tx.insert(schema.campaignRecipient).values(
      validRows.map((row) => ({
        id: newId("campaignRecipient"),
        campaignId,
        organizationId,
        phone: row.phone,
        variables:
          input.channel === "official"
            ? templateVariableKey
              ? { [templateVariableKey]: row.variablesOrdered[0] ?? "" }
              : {}
            : row.variables,
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

/** Nombres de variables detectadas en un mensaje no oficial (para la UI del CSV). */
export function detectMessageVariables(messageTemplate: string): string[] {
  return extractVariables(messageTemplate);
}
