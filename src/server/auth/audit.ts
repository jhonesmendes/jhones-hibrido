import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";

export type AuditAction =
  | "user.login"
  | "invite.created"
  | "invite.used"
  | "invite.revoked"
  | "channel.connected"
  | "channel.disconnected"
  | "campaign.sent"
  | "settings.permissions_changed"
  | "settings.role_changed"
  | "settings.smtp_changed"
  | "settings.ai_changed"
  | "settings.n8n_changed"
  | "n8n.workflow_executed";

/**
 * Registra uma ação crítica (FR-019). Nunca lança: um problema no log de
 * auditoria não deve derrubar a ação real que está sendo registrada.
 */
export async function logAudit(params: {
  organizationId: string;
  memberId?: string | null;
  action: AuditAction;
  resource?: string;
  resourceId?: string;
  req?: Request;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const db = getDb();
    const headers = params.req?.headers;
    await db.insert(schema.auditLog).values({
      id: newId("auditLog"),
      organizationId: params.organizationId,
      memberId: params.memberId ?? null,
      action: params.action,
      resource: params.resource ?? null,
      resourceId: params.resourceId ?? null,
      ipAddress:
        headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
        headers?.get("x-real-ip") ??
        null,
      userAgent: headers?.get("user-agent") ?? null,
      metadata: params.metadata ?? null,
    });
  } catch (err) {
    console.error("[audit] falha ao registrar evento:", err);
  }
}
