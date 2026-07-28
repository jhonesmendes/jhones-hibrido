import { z } from "zod";

/**
 * Ação tipada do agente: exatamente UMA por turno (FR-021).
 * O servidor valida cada ação contra suas allowlists (etapas da org);
 * o que não valida é degradado, nunca é executado às cegas.
 */
export const AgentAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("none") }),
  z.object({ action: z.literal("reply"), text: z.string().min(1) }),
  z.object({
    action: z.literal("update_lead"),
    note: z.string().min(1),
    reply: z.string().optional(),
  }),
  z.object({
    action: z.literal("move_stage"),
    stage: z.string().min(1),
    reply: z.string().optional(),
  }),
  z.object({
    action: z.literal("handoff"),
    reason: z.string().optional(),
    farewell: z.string().optional(),
  }),
]);

export type AgentActionType = z.infer<typeof AgentAction>;

/**
 * Resolve o nome de etapa retornado pelo modelo contra as etapas reais
 * da organização (exato → lower-case). Sem match: degradar para reply/none.
 */
export function resolveStage(
  requested: string,
  stages: { id: string; name: string }[]
): { id: string; name: string } | null {
  const exact = stages.find((s) => s.name === requested.trim());
  if (exact) return exact;
  const lower = requested.trim().toLowerCase();
  return stages.find((s) => s.name.toLowerCase() === lower) ?? null;
}

/** Degrada um move_stage sem etapa válida (FR-021 / contrato ai.md). */
export function degradeAction(action: AgentActionType): AgentActionType {
  if (action.action === "move_stage") {
    return action.reply
      ? { action: "reply", text: action.reply }
      : { action: "none" };
  }
  return action;
}
