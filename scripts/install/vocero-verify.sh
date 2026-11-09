#!/usr/bin/env bash
# ============================================================
# Vocero — relatório de verificação de uma instância (spec 009, US3)
#
#   scripts/install/vocero-verify.sh https://crm.cliente.com.br
#   scripts/install/vocero-verify.sh http://127.0.0.1:3005 --allow-open
#
# Só faz chamadas que não alteram dados (o teste de cadastro fechado só roda
# quando o cadastro já está fechado). Sai com código 1 se algum item reprovar.
# ============================================================
set -uo pipefail

URL="${1:-}"
shift || true
ALLOW_OPEN=0
for a in "$@"; do
  case "$a" in
    --allow-open) ALLOW_OPEN=1 ;;
    *) echo "Opção desconhecida: $a" >&2; exit 2 ;;
  esac
done
if [[ -z "$URL" ]]; then
  echo "Uso: $0 <url-da-instancia> [--allow-open]" >&2
  exit 2
fi
URL="${URL%/}"

PASS=0; FAIL=0; WARN=0
ok()   { printf '  \033[32mAPROVADO\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31mREPROVADO\033[0m %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[33mAVISO\033[0m     %s\n' "$1"; WARN=$((WARN+1)); }

code() { curl -s -o /dev/null -m 15 -w '%{http_code}' "$@"; }
body() { curl -s -m 15 "$@"; }

echo "Verificando $URL"
echo

# 1. Saúde, banco e versão
HEALTH="$(body -w '\n%{http_code}' "$URL/api/health")"
HCODE="${HEALTH##*$'\n'}"; HBODY="${HEALTH%$'\n'*}"
if [[ "$HCODE" == "200" && "$HBODY" == *'"ok":true'* ]]; then
  VERSION="$(sed -n 's/.*"version":"\([^"]*\)".*/\1/p' <<<"$HBODY")"
  COMMIT="$(sed -n 's/.*"commit":"\([^"]*\)".*/\1/p' <<<"$HBODY")"
  ok "Aplicação e banco respondendo (versão ${VERSION:-?}, commit ${COMMIT:-?})"
  [[ "${VERSION:-dev}" == "dev" ]] && warn "Imagem sem versão gravada (build local ou antigo)"
else
  bad "Health /api/health respondeu $HCODE — veja os logs do container app"
fi

# 2. Telas públicas
[[ "$(code "$URL/login")" == "200" ]] && ok "Tela de login carrega" || bad "Tela de login não carrega"

# Anti-clickjacking (spec 010): toda página diz quem pode enquadrá-la.
FA="$(curl -sI -m 15 "$URL/login" | tr -d '\r' | grep -i '^content-security-policy:' | grep -io "frame-ancestors[^;]*")"
if [[ -n "$FA" ]]; then ok "Enquadramento restrito ($FA)"; else bad "Sem frame-ancestors: qualquer site pode embutir o Vocero (clickjacking)"; fi

# 3. Estado do cadastro
REG="$(body "$URL/api/auth/registration-status")"
STATE="$(sed -n 's/.*"state":"\([^"]*\)".*/\1/p' <<<"$REG")"
case "$STATE" in
  closed)          ok "Cadastro público fechado (instância já tem proprietário)" ;;
  awaiting_owner)  ok "Cadastro público fechado, aguardando o convite do proprietário" ;;
  open)
    if [[ $ALLOW_OPEN == 1 ]]; then warn "Cadastro público ABERTO (permitido por --allow-open)"
    else bad "Cadastro público ABERTO — qualquer visitante pode criar conta (ALLOW_SIGNUP=true?)"; fi ;;
  *)               bad "Estado do cadastro desconhecido (resposta: ${REG:0:120})" ;;
esac

# 4. Cadastro direto pela API é recusado (só quando já está fechado: não cria nada)
if [[ "$STATE" == "closed" || "$STATE" == "awaiting_owner" ]]; then
  RND="verify-$(date +%s)-$RANDOM@invalid.test"
  C="$(code -X POST "$URL/api/auth/sign-up/email" -H 'content-type: application/json' \
        -H "origin: $URL" -d "{\"name\":\"verify\",\"email\":\"$RND\",\"password\":\"$(openssl rand -hex 12)\"}")"
  [[ "$C" == "403" ]] && ok "Cadastro direto pela API recusado (403)" || bad "Cadastro direto pela API respondeu $C (esperado 403)"
fi

# 5. Ambiente de testes desligado
M1="$(code "$URL/api/dev/wa-mock/outbox")"; M2="$(code -X POST "$URL/api/dev/ai-mock/chat/completions")"
[[ "$M1" == "404" && "$M2" == "404" ]] && ok "Mocks de teste desligados (404)" || bad "Mocks de teste respondendo ($M1/$M2) — WA_MOCK_ENABLED em produção?"

# 6. API interna
C="$(code -X POST "$URL/api/internal/send-message" -H 'content-type: application/json' -d '{}')"
[[ "$C" == "401" ]] && ok "API interna exige chave (401 sem chave)" || bad "API interna sem chave respondeu $C (esperado 401)"
C="$(code -X POST "$URL/api/internal/send-message" -H 'x-internal-key: vocero_internal_2024' -H 'content-type: application/json' -d '{}')"
[[ "$C" == "401" ]] && ok "Antiga chave padrão recusada" || bad "Antiga chave padrão vocero_internal_2024 ACEITA ($C) — troque INTERNAL_API_KEY"

# 7. Webhook com segmento errado não vaza nada
C="$(code "$URL/api/webhooks/wa/token-de-verificacao-invalido")"
[[ "$C" == "404" ]] && ok "Webhook recusa segmento inválido (404)" || bad "Webhook com segmento inválido respondeu $C"

# 8. HTTPS
if [[ "$URL" == https://* ]]; then
  if curl -s -o /dev/null -m 15 "$URL/login"; then ok "Certificado HTTPS válido"; else bad "Certificado HTTPS inválido ou expirado"; fi
  HTTP_URL="http://${URL#https://}"
  RC="$(code "$HTTP_URL/login")"
  [[ "$RC" =~ ^30[178]$ ]] && ok "HTTP redireciona para HTTPS" || warn "HTTP não redireciona para HTTPS (respondeu $RC)"
else
  case "$URL" in
    http://127.0.0.1*|http://localhost*) warn "Verificado por HTTP local — rode de novo com a URL pública HTTPS" ;;
    *) bad "Instância pública sem HTTPS" ;;
  esac
fi

echo
echo "Resultado: $PASS aprovado(s), $FAIL reprovado(s), $WARN aviso(s)"
if [[ $FAIL -gt 0 ]]; then echo "INSTÂNCIA REPROVADA"; exit 1; fi
echo "INSTÂNCIA APROVADA"
