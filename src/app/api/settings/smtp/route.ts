import { eq } from "drizzle-orm";
import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { encryptSecret } from "@/lib/crypto";
import { scoped } from "@/lib/db/tenant";
import { sendMail, SmtpNotConfiguredError, SmtpSendError } from "@/lib/mail/smtp";
import { logAudit } from "@/server/auth/audit";

export const dynamic = "force-dynamic";

function requireOwner(role: string) {
  return role === "owner";
}

export const GET = withAuth(async (session) => {
  if (!requireOwner(session.role)) {
    return apiError(403, "forbidden", "Só o proprietário configura o SMTP");
  }
  const db = getDb();
  const rows = await db
    .select({
      host: schema.smtpConfig.host,
      port: schema.smtpConfig.port,
      secure: schema.smtpConfig.secure,
      user: schema.smtpConfig.user,
      fromName: schema.smtpConfig.fromName,
      fromEmail: schema.smtpConfig.fromEmail,
      isActive: schema.smtpConfig.isActive,
    })
    .from(schema.smtpConfig)
    .where(scoped(schema.smtpConfig.organizationId, session.organizationId))
    .limit(1);
  return Response.json({ config: rows[0] ?? null });
});

const putSchema = z.object({
  host: z.string().trim().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  user: z.string().trim().min(1),
  password: z.string().min(1).optional(),
  fromName: z.string().trim().min(1),
  fromEmail: z.string().trim().email(),
  isActive: z.boolean(),
});

export const PUT = withAuth(async (session, req: Request) => {
  if (!requireOwner(session.role)) {
    return apiError(403, "forbidden", "Só o proprietário configura o SMTP");
  }
  const body = await parseBody(req, putSchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const existing = await db
    .select({ id: schema.smtpConfig.id })
    .from(schema.smtpConfig)
    .where(scoped(schema.smtpConfig.organizationId, session.organizationId))
    .limit(1);

  if (!body.data.password && !existing[0]) {
    return apiError(422, "password_required", "Informe a senha SMTP");
  }

  const values: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    fromName: string;
    fromEmail: string;
    isActive: boolean;
    passwordCipher?: string;
    passwordIv?: string;
    passwordTag?: string;
  } = {
    host: body.data.host,
    port: body.data.port,
    secure: body.data.secure,
    user: body.data.user,
    fromName: body.data.fromName,
    fromEmail: body.data.fromEmail,
    isActive: body.data.isActive,
  };
  if (body.data.password) {
    const enc = encryptSecret(body.data.password);
    values.passwordCipher = enc.cipher;
    values.passwordIv = enc.iv;
    values.passwordTag = enc.tag;
  }

  if (existing[0]) {
    await db
      .update(schema.smtpConfig)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.smtpConfig.id, existing[0].id));
  } else {
    await db.insert(schema.smtpConfig).values({
      id: newId("smtpConfig"),
      organizationId: session.organizationId,
      ...values,
      passwordCipher: values.passwordCipher!,
      passwordIv: values.passwordIv!,
      passwordTag: values.passwordTag!,
    });
  }

  await logAudit({
    organizationId: session.organizationId,
    memberId: session.memberId,
    action: "settings.smtp_changed",
    resource: "smtp_config",
    req,
  });

  return Response.json({ ok: true });
});

/** Envia um e-mail de teste para o próprio owner. */
export const POST = withAuth(async (session) => {
  if (!requireOwner(session.role)) {
    return apiError(403, "forbidden", "Só o proprietário testa o SMTP");
  }
  const db = getDb();
  const rows = await db
    .select({ email: schema.user.email })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.member.userId, schema.user.id))
    .where(eq(schema.member.id, session.memberId))
    .limit(1);
  const ownerEmail = rows[0]?.email;
  if (!ownerEmail) return apiError(404, "not_found", "E-mail do proprietário não encontrado");

  try {
    await sendMail(session.organizationId, {
      to: ownerEmail,
      subject: "Teste de configuração SMTP — Vocero",
      text: "Se você recebeu este e-mail, a configuração de SMTP está funcionando.",
    });
  } catch (err) {
    if (err instanceof SmtpNotConfiguredError) {
      return apiError(422, "not_configured", "Configure e salve o SMTP antes de testar");
    }
    if (err instanceof SmtpSendError) {
      return apiError(422, "send_failed", err.message);
    }
    throw err;
  }

  return Response.json({ ok: true, sentTo: ownerEmail });
});
