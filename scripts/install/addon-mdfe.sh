#!/usr/bin/env bash
# ============================================================
# Add-on bot MDF-e (spec 009, US7) para uma instância já instalada.
#
#   scripts/install/addon-mdfe.sh --name cliente --env instances/cliente/vocero.env \
#     [--n8n-url https://n8n.cliente.com.br] [--n8n-port 5678] \
#     [--alert-email ops@cliente.com.br] [--alert-phone 5566999999999]
#
# Faz: sobe o n8n na rede da instância → aplica a migração do bot no banco →
# aponta a config do bot para ESTA instância → cria a credencial do Postgres
# no n8n → importa os workflows (desligados). Reexecutar é seguro.
#
# Continua manual (segredos do operador; ver docs/n8n/bot-motorista-mdfe/
# CREDENCIAIS.md): chave do Vocero, token do webhook, OpenAI, SMTP, e
# MDFE_API_USER/MDFE_API_PASS no arquivo de variáveis.
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BOT="$ROOT/docs/n8n/bot-motorista-mdfe"
NAME=""; ENV_FILE=""; N8N_URL=""; N8N_PORT_ARG=""; ALERT_EMAIL=""; ALERT_PHONE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --env) ENV_FILE="$2"; shift 2 ;;
    --n8n-url) N8N_URL="$2"; shift 2 ;;
    --n8n-port) N8N_PORT_ARG="$2"; shift 2 ;;
    --alert-email) ALERT_EMAIL="$2"; shift 2 ;;
    --alert-phone) ALERT_PHONE="$2"; shift 2 ;;
    -h|--help) sed -n '2,17p' "$0"; exit 0 ;;
    *) echo "Opção desconhecida: $1" >&2; exit 2 ;;
  esac
done

die() { printf '\033[31mERRO:\033[0m %s\n' "$*" >&2; exit 1; }
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
[[ -n "$NAME" && -f "$ENV_FILE" ]] || die "Uso: $0 --name <instância> --env <arquivo vocero.env>"
command -v python3 >/dev/null || die "Precisa de python3 (prepara os workflows)"

envget() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -1; }
envset() { # só acrescenta se ainda não existir: nunca troca segredo já gerado
  grep -q "^$1=" "$ENV_FILE" || printf '%s=%s\n' "$1" "$2" >>"$ENV_FILE"
}

SLUG="${NAME//-/_}"
APP_PORT="$(envget APP_PORT)"
envset N8N_PORT "${N8N_PORT_ARG:-$(( ${APP_PORT:-3000} + 2000 ))}"
N8N_PORT="$(envget N8N_PORT)"
envset N8N_PUBLIC_URL "${N8N_URL:-http://127.0.0.1:$N8N_PORT}"
envset N8N_ENCRYPTION_KEY "$(openssl rand -hex 32)"
envset N8N_VOLUME "vocero_n8n_$SLUG"
envset MDFE_API_USER ""
envset MDFE_API_PASS ""
N8N_PUBLIC_URL="$(envget N8N_PUBLIC_URL)"
[[ "$N8N_PUBLIC_URL" == https://* ]] && envset N8N_SECURE_COOKIE true || envset N8N_SECURE_COOKIE false

APP=(docker compose -p "vocero-$NAME" --env-file "$ENV_FILE" -f "$ROOT/docker-compose.yml")
N8N=(docker compose -p "vocero-$NAME-n8n" --env-file "$ENV_FILE" -f "$ROOT/docker-compose.n8n.yml")
DB="$(envget POSTGRES_DB)"

say "Subindo o n8n (porta $N8N_PORT)"
"${N8N[@]}" up -d
for i in $(seq 1 60); do
  curl -fs -m 5 "http://127.0.0.1:$N8N_PORT/healthz" >/dev/null 2>&1 && break
  sleep 2
  [[ $i == 60 ]] && { "${N8N[@]}" logs --tail 30 n8n >&2; die "n8n não respondeu"; }
done
echo "OK"

say "Migração do bot no banco $DB"
"${APP[@]}" exec -T postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q <"$BOT/01-migration-bot-mdfe.sql"
# Os valores padrão do arquivo são os da instalação de referência: aponta
# para ESTA instância só o que ainda estiver no padrão (não sobrescreve
# ajuste feito depois pelo painel).
"${APP[@]}" exec -T postgres psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q \
  -v app_url="$(envget APP_BASE_URL)" -v n8n_url="$N8N_PUBLIC_URL" \
  -v alert_email="$ALERT_EMAIL" -v alert_phone="$ALERT_PHONE" <<'SQL'
UPDATE bot_fluxo_config SET valor = :'app_url'
 WHERE fluxo = 'motorista_mdfe' AND chave = 'vocero_url' AND valor = 'https://sankhya.vocero.com.br';
UPDATE bot_fluxo_config SET valor = :'n8n_url'
 WHERE fluxo = 'motorista_mdfe' AND chave = 'n8n_url' AND valor = 'https://n8n.sankhya.vocero.com.br';
UPDATE bot_fluxo_config SET valor = :'alert_phone'
 WHERE fluxo = 'motorista_mdfe' AND chave = 'contato_alerta' AND (valor = '5566999679169' OR :'alert_phone' <> '');
UPDATE bot_fluxo_config SET valor = :'alert_email'
 WHERE fluxo = 'motorista_mdfe' AND chave = 'email_alerta_para' AND :'alert_email' <> '';
SQL
"${APP[@]}" exec -T postgres psql -U postgres -d "$DB" -Atc \
  "select chave || ' = ' || valor from bot_fluxo_config where fluxo='motorista_mdfe' and chave in ('vocero_url','n8n_url','contato_alerta','email_alerta_para') order by chave"

say "Credencial do Postgres e workflows no n8n"
PG_CRED_ID="vocpg$(openssl rand -hex 6)"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
# Reaproveita a credencial e os ids já importados numa execução anterior.
STATE="$(dirname "$ENV_FILE")/.n8n-addon"
if [[ -f "$STATE" ]]; then . "$STATE"; else
  WF_BOT_ID="vocbot$(openssl rand -hex 5)"; WF_ERR_ID="vocerr$(openssl rand -hex 5)"
  printf 'PG_CRED_ID=%s\nWF_BOT_ID=%s\nWF_ERR_ID=%s\n' "$PG_CRED_ID" "$WF_BOT_ID" "$WF_ERR_ID" >"$STATE"
fi

PG_PASS="$(envget POSTGRES_PASSWORD)" DB="$DB" PG_CRED_ID="$PG_CRED_ID" WF_BOT_ID="$WF_BOT_ID" \
WF_ERR_ID="$WF_ERR_ID" BOT="$BOT" WORK="$WORK" NAME="$NAME" python3 - <<'PY'
import json, os
e = os.environ
cred = [{
    "id": e["PG_CRED_ID"], "name": f"Postgres {e['DB']} (Bot MDF-e)", "type": "postgres",
    "data": {"host": "postgres", "port": 5432, "database": e["DB"], "user": "postgres",
             "password": e["PG_PASS"], "ssl": "disable", "allowUnauthorizedCerts": False,
             "sshTunnel": False},
}]
open(f"{e['WORK']}/cred.json", "w").write(json.dumps(cred))
def prep(path, wf_id, error_wf=None):
    d = json.load(open(path))
    d["id"] = wf_id
    d["active"] = False
    d.pop("versionId", None)
    for n in d["nodes"]:
        pg = (n.get("credentials") or {}).get("postgres")
        if pg:
            pg["id"] = e["PG_CRED_ID"]; pg["name"] = cred[0]["name"]
    if error_wf:
        d.setdefault("settings", {})["errorWorkflow"] = error_wf
    return [d]
json.dump(prep(f"{e['BOT']}/03-n8n-alerta-erro.json", e["WF_ERR_ID"]), open(f"{e['WORK']}/wf-erro.json", "w"), ensure_ascii=False)
json.dump(prep(f"{e['BOT']}/02-n8n-bot-motorista-mdfe.json", e["WF_BOT_ID"], e["WF_ERR_ID"]), open(f"{e['WORK']}/wf-bot.json", "w"), ensure_ascii=False)
PY

CID="$("${N8N[@]}" ps -q n8n)"
for f in cred wf-erro wf-bot; do docker cp "$WORK/$f.json" "$CID:/tmp/$f.json" >/dev/null; done
# O /healthz responde antes de o n8n terminar de preparar o banco interno no
# primeiro boot — a importação pode falhar nos primeiros segundos: tenta de novo.
IMPORTED=0
for attempt in 1 2 3 4 5 6; do
  if docker exec "$CID" n8n import:credentials --input=/tmp/cred.json >/dev/null &&
     docker exec "$CID" n8n import:workflow --input=/tmp/wf-erro.json >/dev/null &&
     docker exec "$CID" n8n import:workflow --input=/tmp/wf-bot.json >/dev/null; then
    IMPORTED=1; break
  fi
  echo "n8n ainda iniciando (tentativa $attempt/6)…"; sleep 5
done
# A credencial leva a senha do banco: não fica no container.
docker exec "$CID" rm -f /tmp/cred.json /tmp/wf-erro.json /tmp/wf-bot.json
[[ $IMPORTED == 1 ]] || die "Não foi possível importar no n8n (veja: docker logs $CID)"
echo "Credencial Postgres criada e workflows importados (desligados)."

cat <<EOF

Falta (no n8n em $N8N_PUBLIC_URL — ver docs/n8n/bot-motorista-mdfe/CREDENCIAIS.md):
  1. Criar a conta do n8n no primeiro acesso.
  2. Credenciais: x-internal-key (chave do Vocero), x-vocero-token (webhook),
     OpenAI e SMTP; selecionar nos nós marcados em vermelho.
  3. MDFE_API_USER e MDFE_API_PASS em $ENV_FILE e:
       docker compose -p vocero-$NAME-n8n --env-file $ENV_FILE -f docker-compose.n8n.yml up -d
  4. Publicar o workflow de alerta e depois o bot.
  5. No Vocero: Campanhas → Automações N8N → URL $N8N_PUBLIC_URL, chave da API do n8n,
     e "Receber mensagens no n8n" com o mesmo token do webhook.
EOF
