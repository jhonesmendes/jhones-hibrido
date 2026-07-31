/**
 * Configuração VAPID (Web Push) — variáveis de ambiente, não por
 * organização: identificam esta instância perante o serviço de push do
 * navegador (FCM/Mozilla/Apple), não um serviço de terceiro escolhido pelo
 * operador (Constituição II). Gere o par com `npx web-push generate-vapid-keys`.
 */
export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

export function getVapidConfig(): VapidConfig | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return null;
  const subject =
    process.env.VAPID_SUBJECT ||
    (process.env.APP_BASE_URL ? `mailto:admin@${safeHost(process.env.APP_BASE_URL)}` : "mailto:admin@localhost");
  return { publicKey, privateKey, subject };
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "localhost";
  }
}
