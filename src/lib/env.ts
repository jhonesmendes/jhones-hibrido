import { z } from "zod";

/**
 * Validação central do ambiente.
 *
 * Lazy + memoizada: é avaliada no primeiro uso em runtime, nunca ao importar.
 * Durante o `next build` não há segredos (a imagem é construída sem eles),
 * então nessa fase placeholders são aceitos — os valores reais chegam no boot.
 */

const envSchema = z.object({
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, {
      message:
        "ENCRYPTION_KEY deve ter 32 bytes em base64 (gere com: openssl rand -base64 32)",
    }),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(8),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default("v25.0"),
  META_GRAPH_BASE_URL: z.string().url().default("https://graph.facebook.com"),
  OPENROUTER_API_TOKEN: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().url().default("https://openrouter.ai/api"),
  OPENROUTER_MODEL: z.string().optional(),
  OPENROUTER_JUDGE_MODEL: z.string().optional(),
  ALLOW_SIGNUP: z.string().optional(),
  AGENT_COALESCE_MS: z.coerce.number().int().min(0).default(6000),
  FOLLOWUP_SCHEDULER_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(5 * 60 * 1000),
  CAMPAIGN_SCHEDULER_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(30 * 1000),
  WA_MOCK_ENABLED: z.string().optional(),
  NODE_ENV: z.string().default("development"),

  // Licenciamento (painel central do operador) — todos opcionais: sem
  // LICENSE_CONTROL_SECRET, a API interna de licença fica travada (falha
  // fechada), e o produto continua funcionando normalmente com a licença
  // trial semeada no primeiro cadastro.
  LICENSE_CONTROL_SECRET: z.string().optional(),
  // Backup de banco (pg_dump/pg_restore) — dump fica SEMPRE em disco local
  // da própria instância (Constituição II, nada de S3/R2). Precisa apontar
  // pra um volume persistente (sobrevive a redeploy), senão os backups
  // somem no próximo deploy.
  BACKUP_DIR: z.string().default("/app/backups"),
  // API interna de envio (ex.: automações N8N) — opcional: sem ela, a rota
  // fica travada (falha fechada), o resto do produto continua normal.
  INTERNAL_API_KEY: z.string().optional(),
  OPERATOR_WHATSAPP: z.string().optional(),
  OPERATOR_EMAIL: z.string().optional(),

  // Painel central (admin.<domínio>) — só usados na instância dedicada ao
  // painel; numa instância de cliente normal ficam todos vazios e as rotas
  // /admin ficam bloqueadas pelo middleware.
  ADMIN_PANEL_HOST: z.string().optional(),
  ADMIN_OPERATOR_EMAIL: z.string().optional(),
  ADMIN_OPERATOR_PASSWORD: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().optional(),
  ADMIN_REPORT_EMAIL: z.string().optional(),
  ADMIN_SMTP_HOST: z.string().optional(),
  ADMIN_SMTP_PORT: z.coerce.number().int().optional(),
  ADMIN_SMTP_SECURE: z.string().optional(),
  ADMIN_SMTP_USER: z.string().optional(),
  ADMIN_SMTP_PASSWORD: z.string().optional(),
  ADMIN_SMTP_FROM_EMAIL: z.string().optional(),
  ADMIN_SMTP_FROM_NAME: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

const BUILD_PLACEHOLDERS: Record<string, string> = {
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://build:build@localhost:5432/build",
  BETTER_AUTH_SECRET: "placeholder-build-secret",
  ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  META_WEBHOOK_VERIFY_TOKEN: "placeholder-verify-token",
};

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  // Strings vazias contam como ausentes: os compose/painéis costumam
  // injetar VAR="" para opcionais e isso deve ativar os valores padrão.
  const source = isBuild
    ? { ...BUILD_PLACEHOLDERS, ...stripEmpty(process.env) }
    : stripEmpty(process.env);
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const missing = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n  ");
    throw new Error(
      `Variáveis de ambiente inválidas ou faltando:\n  ${missing}\n` +
        "Consulte o .env.example para o guia de cada variável."
    );
  }
  cached = parsed.data;
  return cached;
}

function stripEmpty(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined && v !== "") out[k] = v;
  }
  return out;
}

/** true se o ambiente de testes interno (mocks) está habilitado e NÃO é produção. */
export function isMockEnabled(): boolean {
  return (
    process.env.WA_MOCK_ENABLED === "true" &&
    process.env.NODE_ENV !== "production"
  );
}

/** true se há provedor de IA configurado (token presente e não vazio). */
export function isAiConfigured(): boolean {
  const token = process.env.OPENROUTER_API_TOKEN;
  return typeof token === "string" && token.trim().length > 0;
}
