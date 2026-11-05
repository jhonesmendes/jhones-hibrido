import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/**
 * Textos do bot MDF-e na tabela `bot_fluxo_config`, que o workflow do n8n lê a
 * cada mensagem. A tabela não pertence ao Drizzle: é criada pela migração do
 * bot (`docs/n8n/bot-motorista-mdfe/`) só nas instâncias que usam o bot.
 *
 * Só as chaves `msg_*` são editáveis por aqui. As demais (URLs, limites) mudam
 * o funcionamento do fluxo.
 */
export const BOT_FLOW = "motorista_mdfe";
export const MAX_BOT_MESSAGE_LENGTH = 4096;

export type BotMessage = { key: string; value: string; updatedAt: string };

export class BotMessagesError extends Error {
  constructor(public readonly code: "not_available" | "unknown_key", message: string) {
    super(message);
    this.name = "BotMessagesError";
  }
}

/** A migração grava a quebra de linha como `\n` literal; a tela mostra a real. */
export function normalizeBotMessageValue(value: string): string {
  return value.replace(/\\n/g, "\n");
}

async function botTableExists(): Promise<boolean> {
  const rows = await getDb().execute<{ exists: boolean }>(
    sql`select to_regclass('public.bot_fluxo_config') is not null as exists`
  );
  return rows[0]?.exists === true;
}

async function readMessages(): Promise<BotMessage[]> {
  const rows = await getDb().execute<{ chave: string; valor: string; updated_at: Date | string }>(
    sql`select chave, valor, updated_at from bot_fluxo_config
        where fluxo = ${BOT_FLOW} and chave like 'msg\_%' order by chave`
  );
  return Array.from(rows).map((r) => ({
    key: r.chave,
    value: normalizeBotMessageValue(r.valor),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
}

/** `null` = esta instância não tem o bot instalado. */
export async function listBotMessages(): Promise<BotMessage[] | null> {
  if (!(await botTableExists())) return null;
  return readMessages();
}

/** Grava só o que mudou, tudo ou nada. Devolve as chaves alteradas. */
export async function saveBotMessages(updates: Record<string, string>): Promise<string[]> {
  const current = await listBotMessages();
  if (!current) throw new BotMessagesError("not_available", "O bot não está instalado nesta instância");
  const byKey = new Map(current.map((m) => [m.key, m.value]));
  const unknown = Object.keys(updates).filter((key) => !byKey.has(key));
  if (unknown.length > 0) {
    throw new BotMessagesError("unknown_key", `Mensagem desconhecida: ${unknown.join(", ")}`);
  }
  const changed = Object.entries(updates).filter(([key, value]) => byKey.get(key) !== value);
  await getDb().transaction(async (tx) => {
    for (const [key, value] of changed) {
      await tx.execute(
        sql`update bot_fluxo_config set valor = ${value}, updated_at = now()
            where fluxo = ${BOT_FLOW} and chave = ${key}`
      );
    }
  });
  return changed.map(([key]) => key);
}
