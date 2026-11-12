/**
 * Coerência porta ↔ TLS do SMTP.
 *
 * - 465 (SMTPS): TLS implícito — o servidor espera o handshake TLS logo na
 *   conexão. Conectar em texto puro fica esperando o "220" que nunca vem
 *   ("Greeting never received").
 * - 587/25/2525 (submission): conexão em texto puro + STARTTLS, que o
 *   nodemailer faz sozinho quando o servidor anuncia. Forçar `secure` aqui
 *   quebra com "wrong version number".
 *
 * Para essas portas-padrão a porta manda; o checkbox só vale para portas fora
 * do padrão.
 */
export function resolveSmtpSecure(port: number, secure: boolean): boolean {
  if (port === 465) return true;
  if (port === 587 || port === 25 || port === 2525) return false;
  return secure;
}

/** Acrescenta uma dica acionável às mensagens de erro SMTP mais comuns. */
export function explainSmtpError(detail: string, port: number): string {
  const d = detail.toLowerCase();
  if (d.includes("greeting never received")) {
    return `${detail} — o servidor não respondeu na porta ${port}. Confira host/porta (465 = TLS implícito, 587 = STARTTLS) e se o firewall da VPS libera saída nessa porta.`;
  }
  if (d.includes("wrong version number")) {
    return `${detail} — TLS incompatível com a porta ${port}. Use 465 com TLS ou 587 sem TLS (STARTTLS automático).`;
  }
  if (d.includes("etimedout") || d.includes("connection timeout") || d.includes("econnrefused")) {
    return `${detail} — sem conexão com o servidor na porta ${port}. Verifique host, porta e bloqueio de saída SMTP na hospedagem.`;
  }
  if (d.includes("invalid login") || d.includes("authentication") || d.includes("535")) {
    return `${detail} — usuário ou senha recusados pelo servidor.`;
  }
  if (d.includes("553") || d.includes("sender address rejected") || d.includes("not owned")) {
    return `${detail} — o servidor recusou o remetente. Use no "E-mail do remetente" um endereço da própria conta SMTP (normalmente o mesmo do usuário).`;
  }
  return detail;
}
