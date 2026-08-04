import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { deleteDepartment, updateDepartment } from "@/server/settings/departments";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const businessHoursDaySchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(HHMM),
  end: z.string().regex(HHMM),
});

const businessHoursSchema = z.object({
  mon: businessHoursDaySchema.optional(),
  tue: businessHoursDaySchema.optional(),
  wed: businessHoursDaySchema.optional(),
  thu: businessHoursDaySchema.optional(),
  fri: businessHoursDaySchema.optional(),
  sat: businessHoursDaySchema.optional(),
  sun: businessHoursDaySchema.optional(),
});

/** Texto puro (Modo B nunca depende de LLM) — vazio vira `null` (usa o
 * default embutido em `selection.ts`), evita salvar string vazia como
 * "customizada" no banco. */
const messageField = z
  .string()
  .trim()
  .max(1000)
  .nullable()
  .optional()
  .transform((v) => (v === "" ? null : v));

const patchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  color: z.string().trim().max(20).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
  /** Perfil de agente IA padrão do departamento (v0.1, Etapa 6). */
  agentProfileId: z.string().trim().min(1).nullable().optional(),
  /** Fila e roteamento (Sprint Q). */
  queueEnabled: z.boolean().optional(),
  routingMode: z.enum(["automatic", "client-selection"]).optional(),
  distributionMode: z.enum(["round-robin", "least-busy", "first-available", "manual"]).optional(),
  selectionGreeting: messageField,
  selectionFormat: z.enum(["numbered", "letters"]).optional(),
  selectionShowOnlyOnline: z.boolean().optional(),
  selectionTimeoutSeconds: z.number().int().min(10).max(3600).optional(),
  selectionTimeoutAction: z.enum(["auto-assign", "queue", "ai-assumes"]).optional(),
  selectionUnavailableMessage: messageField,
  acceptTimeoutSeconds: z.number().int().min(10).max(3600).optional(),
  acceptTimeoutAction: z.enum(["next-agent", "queue", "ai-assumes"]).optional(),
  maxConversationsPerAgent: z.number().int().min(1).max(999).optional(),
  maxQueueSize: z.number().int().min(1).max(9999).optional(),
  queueMessage: messageField,
  noAgentsMessage: messageField,
  offlineMessage: messageField,
  transferMessage: messageField,
  awayMessage: messageField,
  businessHours: businessHoursSchema.nullable().optional(),
  timezone: z.string().trim().min(1).max(60).optional(),
});

export const PATCH = withAuth(async (session, req: Request, { params }: Params) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Só o proprietário pode editar departamentos");
  }
  const { id } = await params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  await updateDepartment(id, session.organizationId, body.data);

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "department.updated",
    resource: "department",
    resourceId: id,
    req,
  });

  return Response.json({ ok: true });
});

export const DELETE = withAuth(async (session, req: Request, { params }: Params) => {
  if (session.role !== "owner") {
    return apiError(403, "forbidden", "Só o proprietário pode remover departamentos");
  }
  const { id } = await params;
  await deleteDepartment(id, session.organizationId);

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "department.deleted",
    resource: "department",
    resourceId: id,
    req,
  });

  return Response.json({ ok: true });
});
