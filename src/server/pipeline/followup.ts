import { eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { countVariables } from "@/server/whatsapp/templates";

export class FollowupConfigError extends Error {
  code: "invalid";
  constructor(message: string) {
    super(message);
    this.name = "FollowupConfigError";
    this.code = "invalid";
  }
}

type FollowupRow = typeof schema.pipelineFollowup.$inferSelect;

export type FollowupConfigInput = {
  enabled: boolean;
  triggerStageId: string | null;
  intervalValue: number;
  intervalUnit: "hours" | "days";
  /** Lembrete com a janela ABERTA — texto livre. */
  message: string | null;
  /** Lembrete com a janela FECHADA — só modelo aprovado (regra da Meta).
   * Sem isso configurado, um lead com janela fechada simplesmente não
   * recebe lembrete (não tenta texto livre, que a Meta recusaria). */
  templateId: string | null;
  successStageId: string | null;
  expiredStageId: string | null;
  requiresDocument: boolean;
  /** Teto de lembretes (sent/failed) por lead antes de desistir e mover
   * pra `expiredStageId` — rede de segurança contra um lead sendo reaberto
   * e recobrado indefinidamente ao longo do tempo. */
  maxAttempts: number;
  /** Conversa sem nenhuma mensagem há mais que isso não recebe lembrete. */
  staleConversationDays: number;
};

export function serializeFollowup(row: FollowupRow | null) {
  return {
    enabled: row?.enabled ?? false,
    triggerStageId: row?.triggerStageId ?? null,
    intervalValue: row?.intervalValue ?? 4,
    intervalUnit: row?.intervalUnit ?? "hours",
    message: row?.message ?? null,
    templateId: row?.templateId ?? null,
    successStageId: row?.successStageId ?? null,
    expiredStageId: row?.expiredStageId ?? null,
    requiresDocument: row?.requiresDocument ?? false,
    maxAttempts: row?.maxAttempts ?? 3,
    staleConversationDays: row?.staleConversationDays ?? 90,
  };
}

/** Config é por (organização, departamento) — antes era só por organização,
 * disparando pra todo mundo independente de departamento. `departmentId`
 * null = configuração compartilhada (Visão consolidada do owner). */
export async function getFollowupRow(
  organizationId: string,
  departmentId: string | null
): Promise<FollowupRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.pipelineFollowup)
    .where(
      scoped(
        schema.pipelineFollowup.organizationId,
        organizationId,
        departmentId ? eq(schema.pipelineFollowup.departmentId, departmentId) : isNull(schema.pipelineFollowup.departmentId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getFollowupConfig(organizationId: string, departmentId: string | null) {
  return serializeFollowup(await getFollowupRow(organizationId, departmentId));
}

export async function saveFollowupConfig(
  organizationId: string,
  departmentId: string | null,
  input: FollowupConfigInput
) {
  if (input.enabled) {
    if (!input.triggerStageId) {
      throw new FollowupConfigError(
        "Para habilitar o follow-up, escolha uma etapa gatilho"
      );
    }
    if (!input.message?.trim() && !input.templateId) {
      throw new FollowupConfigError(
        "Configure a mensagem (janela aberta) e/ou o modelo (janela fechada) do lembrete"
      );
    }
  }

  const db = getDb();

  if (input.templateId) {
    const templateRows = await db
      .select({ body: schema.template.body })
      .from(schema.template)
      .where(eq(schema.template.id, input.templateId))
      .limit(1);
    if (!templateRows[0]) {
      throw new FollowupConfigError("Modelo selecionado não existe");
    }
    // O agendador só sabe preencher {{1}} com o nome do contato — modelo
    // com mais de uma variável precisaria de dado que não temos aqui
    // (é um lembrete automático, não um envio manual escolhido a dedo).
    if (countVariables(templateRows[0].body) > 1) {
      throw new FollowupConfigError(
        "O modelo de follow-up só pode ter no máximo 1 variável ({{1}} = nome do contato)"
      );
    }
  }
  const existing = await getFollowupRow(organizationId, departmentId);
  const values = {
    enabled: input.enabled,
    triggerStageId: input.triggerStageId,
    intervalValue: input.intervalValue,
    intervalUnit: input.intervalUnit,
    message: input.message,
    templateId: input.templateId,
    successStageId: input.successStageId,
    expiredStageId: input.expiredStageId,
    requiresDocument: input.requiresDocument,
    maxAttempts: input.maxAttempts,
    staleConversationDays: input.staleConversationDays,
    updatedAt: new Date(),
  };

  if (existing) {
    await db
      .update(schema.pipelineFollowup)
      .set(values)
      .where(eq(schema.pipelineFollowup.id, existing.id));
  } else {
    await db.insert(schema.pipelineFollowup).values({
      id: newId("pipelineFollowup"),
      organizationId,
      departmentId,
      ...values,
    });
  }

  return getFollowupConfig(organizationId, departmentId);
}
