import nodemailer from "nodemailer";
import { getEnv } from "@/lib/env";

/** SMTP do painel central — por env var, não por org (não existe org aqui).
 * Mesma ideia de `src/lib/mail/smtp.ts`, só que sem lookup no banco. */
export async function sendAdminMail(message: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const env = getEnv();
  if (!env.ADMIN_SMTP_HOST || !env.ADMIN_SMTP_USER || !env.ADMIN_SMTP_PASSWORD) {
    throw new Error("SMTP do painel central não configurado (ADMIN_SMTP_*)");
  }

  const transport = nodemailer.createTransport({
    host: env.ADMIN_SMTP_HOST,
    port: env.ADMIN_SMTP_PORT ?? 587,
    secure: env.ADMIN_SMTP_SECURE === "true",
    auth: { user: env.ADMIN_SMTP_USER, pass: env.ADMIN_SMTP_PASSWORD },
  });

  await transport.sendMail({
    from: `"${env.ADMIN_SMTP_FROM_NAME ?? "Vocero"}" <${env.ADMIN_SMTP_FROM_EMAIL ?? env.ADMIN_SMTP_USER}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
