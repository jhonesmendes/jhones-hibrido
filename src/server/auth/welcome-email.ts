import { getEnv } from "@/lib/env";
import { sendMail, SmtpNotConfiguredError, SmtpSendError } from "@/lib/mail/smtp";

/**
 * Best-effort: avisa o novo membro de equipe por e-mail com as credenciais
 * de acesso. Sem SMTP configurado (ou se o envio falhar), a UI já mostra a
 * senha temporária na tela para o owner compartilhar manualmente — mesma
 * degradação usada em requestPasswordReset.
 */
export async function sendWelcomeEmail(
  organizationId: string,
  member: { name: string; email: string; password: string }
): Promise<boolean> {
  const loginUrl = `${getEnv().APP_BASE_URL}/login`;
  try {
    await sendMail(organizationId, {
      to: member.email,
      subject: "Sua conta no Vocero CRM",
      text: `Olá, ${member.name}!\n\nUma conta foi criada para você no Vocero CRM.\n\nAcesse: ${loginUrl}\nE-mail: ${member.email}\nSenha temporária: ${member.password}\n\nRecomendamos trocar essa senha após o primeiro acesso.`,
    });
    return true;
  } catch (err) {
    if (err instanceof SmtpNotConfiguredError || err instanceof SmtpSendError) {
      return false;
    }
    throw err;
  }
}
