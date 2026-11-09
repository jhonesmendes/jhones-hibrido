#!/usr/bin/env bash
# ============================================================
# Vocero — instalador de uma instância nova (spec 009, US2)
#
#   scripts/install/vocero-install.sh \
#     --name cliente --url https://crm.cliente.com.br \
#     --owner-email dono@cliente.com.br [--org "Nome do negócio"] [--port 3010]
#
# Faz: gera os segredos → grava instances/<nome>/vocero.env (permissão 600) →
# sobe app + Postgres com nomes de volume/rede próprios → espera o health →
# cria o convite do proprietário → roda o relatório de verificação.
#
# Modos:
#   --mode compose    (padrão) sobe a stack aqui com docker compose
#   --mode portainer  só gera o arquivo de variáveis para colar no Portainer
#
# Outras opções:
#   --version X        fixa a versão da imagem (padrão: latest)
#   --image IMG        usa outra imagem (ex.: build local vocero:dev)
#   --dir DIR          onde guardar instances/ (padrão: ./instances)
#   --openrouter-token, --meta-app-secret   opcionais
#   --embed-origins "https://erp.cliente.com.br"   quem pode embutir (iframe)
#   --addon-mdfe       instala também o n8n + bot MDF-e (ver docs/n8n)
#   --yes              não pergunta nada (falha se faltar dado)
#
# Reexecutar é seguro: segredos de uma instância existente NUNCA são
# regenerados (trocar ENCRYPTION_KEY tornaria ilegíveis os dados cifrados).
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT/docker-compose.yml"

MODE=compose; NAME=""; BASE_URL=""; OWNER_EMAIL=""; ORG=""; PORT=""; VERSION=""
IMAGE=""; DIR="$PWD/instances"; OPENROUTER=""; META_SECRET=""; ADDON_MDFE=0; YES=0; EMBED_ORIGINS=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --url) BASE_URL="$2"; shift 2 ;;
    --owner-email) OWNER_EMAIL="$2"; shift 2 ;;
    --org) ORG="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --version) VERSION="$2"; shift 2 ;;
    --image) IMAGE="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    --openrouter-token) OPENROUTER="$2"; shift 2 ;;
    --meta-app-secret) META_SECRET="$2"; shift 2 ;;
    --embed-origins) EMBED_ORIGINS="$2"; shift 2 ;;
    --addon-mdfe) ADDON_MDFE=1; shift ;;
    --yes|-y) YES=1; shift ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "Opção desconhecida: $1" >&2; exit 2 ;;
  esac
done

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
die()  { printf '\033[31mERRO:\033[0m %s\n' "$*" >&2; exit 1; }
ask()  { # ask VAR --flag "Pergunta"
  local var="$1" flag="$2" q="$3" v
  if [[ -n "${!var}" ]]; then return; fi
  [[ $YES == 1 ]] && die "Falta $flag (modo --yes)"
  read -r -p "$q: " v; printf -v "$var" '%s' "$v"
}

for bin in openssl curl; do command -v "$bin" >/dev/null || die "Precisa de '$bin' instalado"; done
[[ "$MODE" == compose || "$MODE" == portainer ]] || die "--mode deve ser compose ou portainer"
if [[ "$MODE" == compose ]]; then
  docker compose version >/dev/null 2>&1 || die "Precisa do Docker com o plugin 'docker compose'"
fi

ask NAME --name "Nome curto da instância (letras minúsculas, números e hífen, ex.: fibra-forte)"
[[ "$NAME" =~ ^[a-z0-9][a-z0-9-]{1,30}$ ]] || die "Nome inválido: use 2–31 caracteres a-z, 0-9 e hífen"
ask BASE_URL --url "Endereço público (ex.: https://crm.cliente.com.br)"
[[ "$BASE_URL" =~ ^https?://[^/]+$ ]] || die "Endereço deve ser só esquema + domínio, sem barra no fim"
ask OWNER_EMAIL --owner-email "E-mail do proprietário (recebe o convite)"
[[ "$OWNER_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || die "E-mail inválido"

SLUG="${NAME//-/_}"
INST_DIR="$DIR/$NAME"
ENV_FILE="$INST_DIR/vocero.env"
mkdir -p "$INST_DIR"; chmod 700 "$INST_DIR"

# ---------- variáveis (gera só o que ainda não existe) ----------
if [[ -f "$ENV_FILE" ]]; then
  say "Instância '$NAME' já existe — reaproveitando $ENV_FILE (segredos preservados)"
else
  say "Gerando segredos e variáveis de '$NAME'"
  [[ -z "$PORT" ]] && PORT=3000
  umask 077
  cat >"$ENV_FILE" <<EOF
# Vocero — instância $NAME (gerado em $(date -u +%Y-%m-%dT%H:%M:%SZ))
# NÃO versione este arquivo. Guarde uma cópia segura: sem ENCRYPTION_KEY os
# dados cifrados (tokens do WhatsApp, SMTP, IA) não podem ser lidos.
APP_BASE_URL=$BASE_URL
APP_PORT=$PORT
VOCERO_VERSION=${VERSION:-latest}
POSTGRES_DB=vocero_$SLUG
POSTGRES_PASSWORD=$(openssl rand -hex 24)
POSTGRES_VOLUME=vocero_pg_$SLUG
BACKUPS_VOLUME=vocero_backups_$SLUG
NETWORK_NAME=vocero-net-$NAME
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)
META_WEBHOOK_VERIFY_TOKEN=$(openssl rand -hex 32)
META_APP_SECRET=$META_SECRET
META_GRAPH_API_VERSION=v25.0
OPENROUTER_API_TOKEN=$OPENROUTER
OPENROUTER_MODEL=${OPENROUTER:+anthropic/claude-sonnet-4.5}
INTERNAL_API_KEY=
LICENSE_CONTROL_SECRET=
# Origens que podem abrir o Vocero num iframe (ex.: painel do Sankhya).
EMBED_ALLOWED_ORIGINS=${EMBED_ORIGINS:-}
EOF
  chmod 600 "$ENV_FILE"
fi

envget() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1; }
PORT="$(envget APP_PORT)"
[[ -z "$(envget META_APP_SECRET)" ]] && META_WARN=1 || META_WARN=0

if [[ "$MODE" == portainer ]]; then
  say "Arquivo de variáveis pronto: $ENV_FILE"
  cat <<EOF

No Portainer:
  1. Stacks → Add stack → Repository
     URL: o repositório do Vocero · branch main · compose path docker-compose.yml
  2. Environment variables → "Load variables from .env file" → $ENV_FILE
  3. Deploy the stack e aponte o domínio para a porta $PORT.
  4. Depois que subir, no console do container app:
       node bootstrap-owner.mjs --email $OWNER_EMAIL${ORG:+ --org "$ORG"}
     e envie o link impresso ao proprietário.
  5. Verifique: scripts/install/vocero-verify.sh $BASE_URL
EOF
  exit 0
fi

# ---------- subir a stack ----------
DC=(docker compose -p "vocero-$NAME" --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
if [[ -n "$IMAGE" ]]; then
  OVERRIDE="$INST_DIR/image.override.yml"
  printf 'services:\n  app:\n    image: %s\n' "$IMAGE" >"$OVERRIDE"
  DC+=(-f "$OVERRIDE")
elif [[ -f "$INST_DIR/image.override.yml" ]]; then
  DC+=(-f "$INST_DIR/image.override.yml")
fi

# Volume de banco com o mesmo nome já existente e instância nova = risco de
# ligar o banco de OUTRO cliente. Só segue se a instância já subiu antes.
PGVOL="$(envget POSTGRES_VOLUME)"
if docker volume inspect "$PGVOL" >/dev/null 2>&1 && [[ ! -f "$INST_DIR/.installed" ]]; then
  die "O volume $PGVOL já existe e não foi criado por este instalador. Escolha outro --name."
fi

say "Subindo app + Postgres (projeto vocero-$NAME, porta $PORT)"
"${DC[@]}" config -q
[[ -z "$IMAGE" ]] && "${DC[@]}" pull -q app || true
"${DC[@]}" up -d
touch "$INST_DIR/.installed"

say "Aguardando a aplicação ficar saudável"
LOCAL_URL="http://127.0.0.1:$PORT"
for i in $(seq 1 90); do
  if curl -fs -m 5 "$LOCAL_URL/api/health" >/dev/null 2>&1; then break; fi
  sleep 2
  if [[ $i == 90 ]]; then
    "${DC[@]}" logs --tail 40 app >&2 || true
    die "A aplicação não respondeu em 3 minutos (logs acima)"
  fi
done
echo "OK — $(curl -s "$LOCAL_URL/api/health")"

say "Convite do proprietário"
INVITE_JSON="$("${DC[@]}" exec -T app node bootstrap-owner.mjs --email "$OWNER_EMAIL" ${ORG:+--org "$ORG"} --json || true)"
INVITE_URL="$(sed -n 's/.*"url":"\([^"]*\)".*/\1/p' <<<"$INVITE_JSON")"
if [[ -n "$INVITE_URL" ]]; then
  echo "Envie este link ao proprietário ($OWNER_EMAIL). Uso único, vale 72 horas:"
  echo "  $INVITE_URL"
elif [[ "$INVITE_JSON" == *'"org_exists"'* ]]; then
  echo "A instância já tem proprietário — nenhum convite novo foi criado."
else
  die "Não foi possível criar o convite: $INVITE_JSON"
fi

if [[ $ADDON_MDFE == 1 ]]; then
  say "Add-on bot MDF-e"
  "$ROOT/scripts/install/addon-mdfe.sh" --name "$NAME" --env "$ENV_FILE"
fi

say "Relatório de verificação"
"$ROOT/scripts/install/vocero-verify.sh" "$LOCAL_URL" || VERIFY_FAIL=1

say "Pronto"
cat <<EOF
  Variáveis:   $ENV_FILE  (guarde uma cópia segura)
  Local:       $LOCAL_URL
  Público:     $BASE_URL  → aponte o proxy/DNS para a porta $PORT
  Verificar:   scripts/install/vocero-verify.sh $BASE_URL
  Novo convite: docker compose -p vocero-$NAME exec app node bootstrap-owner.mjs --email $OWNER_EMAIL
EOF
[[ $META_WARN == 1 ]] && echo "  Aviso: META_APP_SECRET vazio — preencha ao conectar o canal oficial (assinatura do webhook)."
[[ "${VERIFY_FAIL:-0}" == 1 ]] && exit 1
exit 0
