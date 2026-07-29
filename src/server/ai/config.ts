import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { isAiConfigured } from "@/lib/env";
import type { ResolvedAiConfig } from "@/lib/ai";

/**
 * Resolve a configuração de IA efetiva de uma organização: a linha salva em
 * `ai_config` (painel Configurações → Inteligência IA) tem prioridade; sem
 * ela, cai para as variáveis de ambiente OPENROUTER_* (compatibilidade com
 * instâncias que só configuram via `.env`, Constituição II).
 */
export async function resolveAiConfig(
  organizationId: string
): Promise<ResolvedAiConfig | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.aiConfig)
    .where(eq(schema.aiConfig.organizationId, organizationId))
    .limit(1);
  const row = rows[0];

  if (row && row.apiKeyCipher && row.apiKeyIv && row.apiKeyTag) {
    return {
      baseUrl: row.baseUrl,
      apiKey: decryptSecret({
        cipher: row.apiKeyCipher,
        iv: row.apiKeyIv,
        tag: row.apiKeyTag,
      }),
      model: row.model,
      fallbackModel: row.fallbackModel,
      temperature: row.temperature,
      maxTokens: row.maxTokens,
      contextMessages: row.contextMessages,
    };
  }

  // Leitura direta do process.env (não getEnv()): a config de IA é
  // independente do resto das variáveis obrigatórias da instância — um
  // .env de teste/parcial não deve derrubar a resolução do agente.
  if (!isAiConfigured()) return null;
  const model = process.env.OPENROUTER_MODEL;
  if (!model?.trim()) return null;
  return {
    baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api",
    apiKey: process.env.OPENROUTER_API_TOKEN!,
    model,
    fallbackModel: process.env.OPENROUTER_JUDGE_MODEL || null,
    temperature: null,
    maxTokens: null,
    contextMessages: 20,
  };
}

export type AiConfigView = {
  baseUrl: string;
  apiKeyLast4: string | null;
  model: string;
  fallbackModel: string | null;
  temperature: number;
  maxTokens: number;
  contextMessages: number;
  hasApiKey: boolean;
};

export async function getAiConfigView(
  organizationId: string
): Promise<AiConfigView | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.aiConfig)
    .where(eq(schema.aiConfig.organizationId, organizationId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    baseUrl: row.baseUrl,
    apiKeyLast4: row.apiKeyLast4,
    model: row.model,
    fallbackModel: row.fallbackModel,
    temperature: row.temperature,
    maxTokens: row.maxTokens,
    contextMessages: row.contextMessages,
    hasApiKey: Boolean(row.apiKeyCipher),
  };
}

export async function saveAiConfig(
  organizationId: string,
  input: {
    baseUrl: string;
    apiKey?: string;
    model: string;
    fallbackModel?: string | null;
    temperature: number;
    maxTokens: number;
    contextMessages: number;
  }
): Promise<void> {
  const db = getDb();
  const existing = await db
    .select({ id: schema.aiConfig.id })
    .from(schema.aiConfig)
    .where(eq(schema.aiConfig.organizationId, organizationId))
    .limit(1);

  const values: {
    baseUrl: string;
    model: string;
    fallbackModel: string | null;
    temperature: number;
    maxTokens: number;
    contextMessages: number;
    apiKeyCipher?: string;
    apiKeyIv?: string;
    apiKeyTag?: string;
    apiKeyLast4?: string;
  } = {
    baseUrl: input.baseUrl,
    model: input.model,
    fallbackModel: input.fallbackModel ?? null,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    contextMessages: input.contextMessages,
  };
  if (input.apiKey) {
    const enc = encryptSecret(input.apiKey);
    values.apiKeyCipher = enc.cipher;
    values.apiKeyIv = enc.iv;
    values.apiKeyTag = enc.tag;
    values.apiKeyLast4 = input.apiKey.slice(-4);
  }

  if (existing[0]) {
    await db
      .update(schema.aiConfig)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.aiConfig.id, existing[0].id));
    return;
  }

  if (!input.apiKey) {
    throw new Error("Informe a chave de API na primeira configuração");
  }
  await db.insert(schema.aiConfig).values({
    id: newId("aiConfig"),
    organizationId,
    ...values,
  });
}
