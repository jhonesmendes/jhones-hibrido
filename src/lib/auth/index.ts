import { AsyncLocalStorage } from "node:async_hooks";
import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { getDb, schema } from "@/lib/db";
import { logAudit } from "@/server/auth/audit";
import { getEnv } from "@/lib/env";
import { AUTH_RATE_LIMIT, checkRateLimit } from "@/lib/rate-limit";
import {
  onUserCreated,
  resolveActiveOrganizationId,
  resolveMembership,
} from "@/server/auth/on-signup";
import { isPublicSignupAllowed } from "@/server/auth/registration";

/**
 * Contexto interno do processo: permite que a criação de contas de equipe
 * (owner → API) atravesse o gate de registro fechado. Não é alcançável
 * de fora: só envolve chamadas server-side.
 */
const globalForSignup = globalThis as unknown as {
  __voceroInternalSignup?: AsyncLocalStorage<boolean>;
};

// Em globalThis: os módulos podem ser avaliados mais de uma vez (uma por
// rota em dev) e todas as cópias devem compartilhar o mesmo contexto.
function internalSignupContext(): AsyncLocalStorage<boolean> {
  if (!globalForSignup.__voceroInternalSignup) {
    globalForSignup.__voceroInternalSignup = new AsyncLocalStorage<boolean>();
  }
  return globalForSignup.__voceroInternalSignup;
}

export function runInternalSignup<T>(fn: () => Promise<T>): Promise<T> {
  return internalSignupContext().run(true, fn);
}

function isInternalSignup(): boolean {
  return internalSignupContext().getStore() === true;
}

const RATE_LIMITED_PATHS = new Set(["/sign-in/email", "/sign-up/email"]);

// `next dev` cai para outra porta quando a padrão já está ocupada (aqui,
// pelo próprio compose de produção do dono no host) — sem isso, o Better
// Auth rejeita a origem com 403 assim que a porta muda.
const DEV_TRUSTED_ORIGINS =
  process.env.NODE_ENV !== "production"
    ? Array.from({ length: 20 }, (_, i) => `http://localhost:${3000 + i}`)
    : undefined;

function createAuth() {
  const env = getEnv();
  return betterAuth({
    baseURL: env.APP_BASE_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: DEV_TRUSTED_ORIGINS,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        organization: schema.organization,
        member: schema.member,
        invitation: schema.invitation,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    plugins: [organization({ creatorRole: "owner" })],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // Rate limit por IP em login/registro (FR-062): 10 / 10 min → 429.
        if (RATE_LIMITED_PATHS.has(ctx.path)) {
          const ip =
            ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
            ctx.headers?.get("x-real-ip") ||
            "local";
          const result = checkRateLimit(`${ctx.path}:${ip}`, AUTH_RATE_LIMIT);
          if (!result.allowed) {
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "Muitas tentativas; aguarde alguns minutos",
            });
          }
        }
        // Registro público fechado após a primeira organização (FR-060).
        if (ctx.path === "/sign-up/email") {
          if (!isInternalSignup() && !(await isPublicSignupAllowed())) {
            throw new APIError("FORBIDDEN", {
              message:
                "O cadastro está fechado: esta instância já tem a sua organização",
            });
          }
        }
        // Membro desativado não consegue logar (FR-009). Não importa se a
        // senha estaria certa — o bloqueio é por status, verificado antes
        // da credencial para não depender de sessão criada e revogada.
        if (ctx.path === "/sign-in/email") {
          const email = (ctx.body as { email?: string } | undefined)?.email;
          if (email) {
            const db = getDb();
            const rows = await db
              .select({ isActive: schema.member.isActive })
              .from(schema.user)
              .innerJoin(schema.member, eq(schema.member.userId, schema.user.id))
              .where(eq(schema.user.email, email))
              .limit(1);
            if (rows[0] && !rows[0].isActive) {
              throw new APIError("FORBIDDEN", {
                message: "Conta desativada — fale com o administrador",
              });
            }
          }
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-in/email" && ctx.context.newSession) {
          const membership = await resolveMembership(
            ctx.context.newSession.user.id
          );
          if (membership) {
            await logAudit({
              organizationId: membership.organizationId,
              memberId: membership.memberId,
              action: "user.login",
              req: ctx.request,
            });
          }
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await onUserCreated(user.id, user.name);
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            const organizationId = await resolveActiveOrganizationId(
              session.userId
            );
            return {
              data: { ...session, activeOrganizationId: organizationId },
            };
          },
        },
      },
    },
  });
}

type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { __voceroAuth?: Auth };

export function getAuth(): Auth {
  if (!globalForAuth.__voceroAuth) globalForAuth.__voceroAuth = createAuth();
  return globalForAuth.__voceroAuth;
}
