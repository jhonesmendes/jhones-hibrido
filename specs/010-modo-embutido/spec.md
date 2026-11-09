# 010 — Modo embutido (iframe) no Sankhya

## Objetivo

Abrir a **Caixa de entrada**, a **Fila** e o **Pipeline** do Vocero numa aba de
tela do painel do Sankhya (iframe), com login funcionando dentro do quadro, sem
criar um módulo separado: é o mesmo app, mesma instância, mesmo deploy.

## Decisões

- **Uma env por instância**: `EMBED_ALLOWED_ORIGINS` — lista (vírgula/espaço)
  das origens que podem embutir o Vocero, ex. `https://erp.cliente.com.br`.
  Vazia = ninguém de fora pode embutir.
- **Anti-clickjacking sempre ligado**: toda resposta leva
  `Content-Security-Policy: frame-ancestors 'self' <origens>`; sem origens,
  também `X-Frame-Options: SAMEORIGIN`. O painel do operador (`ADMIN_PANEL_HOST`)
  nunca pode ser embutido (`frame-ancestors 'none'` + `DENY`).
- **Cookie de sessão compatível com iframe**: com origens configuradas, os
  cookies do Better Auth saem `SameSite=None; Secure; Partitioned` (CHIPS). O
  cookie particionado vale só dentro do Sankhya: o usuário faz login uma vez no
  quadro; o Vocero aberto direto continua com o seu próprio login.
- **Layout compacto**: URL com `?embed=1` liga o modo embutido (cookie
  particionado `vocero_embed`, lembrado só dentro do quadro); `?embed=0`
  desliga. No modo embutido some a barra lateral; fica uma barra superior com
  Caixa de entrada · Fila · Pipeline, contador de não lidas, status do
  atendente, aviso de fila, "Abrir no Vocero" (nova aba) e Sair.
- **Dentro de iframe** o pedido de notificação do navegador/push é escondido
  (navegadores bloqueiam em quadro de outra origem); o som continua.

## URLs para o painel do Sankhya

- `https://<vocero>/inbox?embed=1`
- `https://<vocero>/queue?embed=1`
- `https://<vocero>/pipeline?embed=1`
- `https://<vocero>/inbox?embed=1&phone=<telefone>&name=<nome>`: link direto
  do botão "WhatsApp motorista" (gadget Call Center). Abre a conversa
  existente ou cria contato e conversa sem enviar nada. Se o contato está com
  outro atendente, pergunta antes de assumir; telefone inválido ou sem canal
  conectado mostra um aviso.

Iframe recomendado:
`<iframe src="…?embed=1" allow="microphone; clipboard-write; autoplay"></iframe>`

## Login (decisão do dono, 2026-11-09)

Cada pessoa entra com o próprio login do Vocero dentro do quadro: quem
atende tem de ser identificado pelo Vocero. Sem SSO com o Sankhya.

## Critérios de aceitação

1. Sem `EMBED_ALLOWED_ORIGINS`, qualquer página responde com
   `frame-ancestors 'self'` e `X-Frame-Options: SAMEORIGIN`.
2. Com a origem do Sankhya configurada, uma página nessa origem embute
   `/inbox?embed=1`, o usuário faz login dentro do quadro e vê a Caixa de
   entrada com a barra compacta (sem a barra lateral), e navega para Fila e
   Pipeline sem sair do modo embutido.
3. Origem fora da lista não consegue embutir (CSP).
4. Vocero aberto direto (fora do quadro) mantém o layout normal.
5. `?phone=` abre a conversa daquele telefone dentro do quadro. Repetir o
   link não duplica a conversa; telefone inválido ou instância sem canal
   conectado mostram um aviso legível.
