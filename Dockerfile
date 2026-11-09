# ============================================================
# Vocero CRM — imagen multi-etapa (Next.js standalone + Node 22)
# Los secretos NO se necesitan en build: llegan en runtime.
# ============================================================

FROM node:22-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build
# migrate.mjs autocontenido (drizzle-orm + postgres bundleados)
RUN pnpm exec esbuild scripts/migrate.mjs --bundle --platform=node \
    --format=esm --outfile=migrate.bundle.mjs \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
RUN pnpm exec esbuild scripts/seed/demo.ts --bundle --platform=node \
    --format=esm --outfile=seed-demo.bundle.mjs --alias:@=./src \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
# Ferramentas de operação dentro do container (spec 009): convite do dono e
# recuperação da senha do dono.
RUN pnpm exec esbuild scripts/bootstrap-owner.ts --bundle --platform=node \
    --format=esm --outfile=bootstrap-owner.bundle.mjs --alias:@=./src \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
RUN pnpm exec esbuild scripts/recover-owner-password.ts --bundle --platform=node \
    --format=esm --outfile=recover-owner-password.bundle.mjs --alias:@=./src \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);"

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# ffmpeg: reconverte áudio gravado no navegador (audio/webm) pra ogg/opus
# antes do upload — a Cloud API da Meta rejeita webm (erro #100).
# postgresql16-client: pg_dump/pg_restore do backup interno (server/backup) —
# dump local, nunca sai da instância (Constituição II, sem S3/R2).
RUN apk add --no-cache ffmpeg postgresql16-client
RUN addgroup -S vocero && adduser -S vocero -G vocero
# BACKUP_DIR (default /app/backups) — monte um volume aqui em produção,
# senão os backups somem a cada redeploy.
RUN mkdir -p /app/backups && chown vocero:vocero /app/backups
# MEDIA_DIR (default /app/media) — mídia das mensagens em arquivo; também
# precisa de volume persistente.
RUN mkdir -p /app/media && chown vocero:vocero /app/media

COPY --from=builder --chown=vocero:vocero /app/.next/standalone ./
COPY --from=builder --chown=vocero:vocero /app/.next/static ./.next/static
COPY --from=builder --chown=vocero:vocero /app/public ./public
COPY --from=builder --chown=vocero:vocero /app/migrate.bundle.mjs ./migrate.mjs
COPY --from=builder --chown=vocero:vocero /app/seed-demo.bundle.mjs ./seed-demo.mjs
COPY --from=builder --chown=vocero:vocero /app/bootstrap-owner.bundle.mjs ./bootstrap-owner.mjs
COPY --from=builder --chown=vocero:vocero /app/recover-owner-password.bundle.mjs ./recover-owner-password.mjs
COPY --from=builder --chown=vocero:vocero /app/drizzle ./drizzle

# Versão do build — exposta em /api/health (o CI passa os dois).
ARG APP_VERSION=dev
ARG GIT_SHA=dev
ENV APP_VERSION=$APP_VERSION
ENV GIT_SHA=$GIT_SHA

USER vocero
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# start-period amplio: cubre las migraciones del arranque
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

# Migrar al BOOT del contenedor nuevo y arrancar el server standalone
CMD ["sh", "-c", "node migrate.mjs && node server.js"]
#CMD ["node", "server.js"]