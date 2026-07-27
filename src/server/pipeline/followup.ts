import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

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
  message: string | null;
  successStageId: string | null;
  expiredStageId: string | null;
  requiresDocument: boolean;
};

export function serializeFollowup(row: FollowupRow | null) {
  return {
    enabled: row?.enabled ?? false,
    triggerStageId: row?.triggerStageId ?? null,
    intervalValue: row?.intervalValue ?? 4,
    intervalUnit: row?.intervalUnit ?? "hours",
    message: row?.message ?? null,
    successStageId: row?.successStageId ?? null,
    expiredStageId: row?.expiredStageId ?? null,
    requiresDocument: row?.requiresDocument ?? false,
  };
}

export async function getFollowupRow(
  organizationId: string
): Promise<FollowupRow | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.pipelineFollowup)
    .where(scoped(schema.pipelineFollowup.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function getFollowupConfig(organizationId: string) {
  return serializeFollowup(await getFollowupRow(organizationId));
}

export async function saveFollowupConfig(
  organizationId: string,
  input: FollowupConfigInput
) {
  if (input.enabled && (!input.triggerStageId || !input.message?.trim())) {
    throw new FollowupConfigError(
      "Para habilitar o follow-up, escolha uma etapa gatilho e escreva a mensagem"
    );
  }

  const db = getDb();
  const existing = await getFollowupRow(organizationId);
  const values = {
    enabled: input.enabled,
    triggerStageId: input.triggerStageId,
    intervalValue: input.intervalValue,
    intervalUnit: input.intervalUnit,
    message: input.message,
    successStageId: input.successStageId,
    expiredStageId: input.expiredStageId,
    requiresDocument: input.requiresDocument,
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
      ...values,
    });
  }

  return getFollowupConfig(organizationId);
}
