import type { z } from "zod";
import { getEnv, isAiConfigured } from "@/lib/env";

/**
 * Adaptador LLM OpenRouter-compatible — ÚNICA fronteira com o provedor de IA
 * (Constituição II). Regra operacional: a saída do modelo é imprevisível;
 * todo consumo passa por extração robusta + Zod + retentativas, e um soluço
 * do provedor jamais propaga exceção (resultado `error` tipado).
 */

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatJsonResult<T> =
  | { ok: true; data: T; raw: string }
  | { ok: false; error: "not_configured" | "provider_error" | "invalid_output"; detail: string };

/**
 * Configuração já resolvida (org override em `ai_config` ou fallback para
 * env) — ver `src/server/ai/config.ts`. `lib/ai` fica adaptador-puro: não
 * consulta o banco, só recebe o resultado já resolvido.
 */
export type ResolvedAiConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  fallbackModel: string | null;
  temperature: number | null;
  maxTokens: number | null;
  contextMessages: number;
};

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;

function resolveFromEnv(judge: boolean): ResolvedAiConfig | null {
  if (!isAiConfigured()) return null;
  const env = getEnv();
  const model = judge ? (env.OPENROUTER_JUDGE_MODEL ?? env.OPENROUTER_MODEL) : env.OPENROUTER_MODEL;
  if (!model?.trim()) return null;
  return {
    baseUrl: env.OPENROUTER_BASE_URL,
    apiKey: env.OPENROUTER_API_TOKEN!,
    model,
    fallbackModel: null,
    temperature: null,
    maxTokens: null,
    contextMessages: 20,
  };
}

export async function chatJson<T>(
  schema: z.ZodType<T>,
  messages: ChatMessage[],
  opts?: {
    model?: string;
    judge?: boolean;
    timeoutMs?: number;
    /** Config já resolvida (org override ou env) — ver resolveAiConfig(). */
    config?: ResolvedAiConfig | null;
  }
): Promise<ChatJsonResult<T>> {
  const resolved = opts?.config ?? resolveFromEnv(opts?.judge ?? false);
  if (!resolved) {
    return {
      ok: false,
      error: "not_configured",
      detail: "Sem provedor de IA configurado (Configurações → Inteligência IA ou OPENROUTER_API_TOKEN)",
    };
  }
  const model =
    opts?.model ??
    (opts?.judge ? (resolved.fallbackModel ?? resolved.model) : resolved.model);
  if (!model?.trim()) {
    return {
      ok: false,
      error: "not_configured",
      detail: "Sem modelo configurado",
    };
  }

  let lastDetail = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptMessages: ChatMessage[] =
      attempt === 1
        ? messages
        : [
            ...messages,
            {
              role: "system",
              content:
                "STRICT: sua resposta anterior não foi JSON válido segundo o esquema. Responda SOMENTE o objeto JSON, sem explicações nem markdown.",
            },
          ];
    try {
      const raw = await callProvider(resolved, model, attemptMessages, opts?.timeoutMs);
      const extracted = extractJson(raw);
      if (extracted === null) {
        lastDetail = `sem JSON extraível (raw=${truncate(raw)})`;
        continue;
      }
      const parsed = schema.safeParse(extracted);
      if (!parsed.success) {
        lastDetail = `não cumpre o esquema: ${parsed.error.issues
          .map((i) => i.path.join(".") + " " + i.message)
          .join("; ")} (raw=${truncate(raw)})`;
        continue;
      }
      return { ok: true, data: parsed.data, raw };
    } catch (err) {
      lastDetail = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  return {
    ok: false,
    error: lastDetail.includes("esquema") || lastDetail.includes("JSON")
      ? "invalid_output"
      : "provider_error",
    detail: lastDetail,
  };
}

/** Aceita base URL com ou sem sufixo `/v1` (convenção varia por provedor). */
function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? `${trimmed}/chat/completions` : `${trimmed}/v1/chat/completions`;
}

async function callProvider(
  config: ResolvedAiConfig,
  model: string,
  messages: ChatMessage[],
  timeoutMs = 60_000
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(chatCompletionsUrl(config.baseUrl), {
      method: "POST",
      headers: {
        // O token jamais é logado; só viaja neste header.
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        ...(config.temperature != null ? { temperature: config.temperature } : {}),
        ...(config.maxTokens != null ? { max_tokens: config.maxTokens } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`provedor respondeu ${res.status}: ${truncate(text)}`);
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new Error("resposta do provedor sem conteúdo");
    }
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extração robusta de JSON de uma resposta de modelo:
 * 1) bloco ```json ... ``` (ou ``` ... ```), 2) o texto completo,
 * 3) do primeiro `{` ao último `}`.
 */
export function extractJson(raw: string): unknown | null {
  const candidates: string[] = [];
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) candidates.push(fence[1].trim());
  candidates.push(raw.trim());
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first !== -1 && last > first) {
    candidates.push(raw.slice(first, last + 1));
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // próximo candidato
    }
  }
  return null;
}

/** Testa uma configuração (não salva) enviando uma chamada mínima real ao provedor. */
export async function testAiConnection(
  config: Pick<ResolvedAiConfig, "baseUrl" | "apiKey" | "model">
): Promise<{ ok: true } | { ok: false; message: string }> {
  const full: ResolvedAiConfig = {
    fallbackModel: null,
    temperature: null,
    maxTokens: null,
    contextMessages: 20,
    ...config,
  };
  try {
    await callProvider(full, full.model, [{ role: "user", content: "ping" }], 15_000);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

function truncate(s: string, n = 300): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
