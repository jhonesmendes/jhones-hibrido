# Bot MDF-e e oferta de cargas pelo n8n (instância Sankhya)

Operação prevista: sem atendente humano. O Vocero recebe e grava; o n8n conduz.
Workflow em `docs/n8n/bot-motorista-mdfe/`.

## Regras

- **Só o motorista encerra o MDF-e.** A API valida o telefone do remetente contra o
  documento. O bot aceita foto ou PDF em qualquer momento, sem passar pelo menu, e
  devolve a confirmação ao motorista.
- **Nada inventado.** A IA (chave da OpenAI, configurada no n8n; o agente do Vocero
  fica desligado) só classifica a mensagem numa lista fechada de intenções. O texto
  enviado é sempre uma mensagem fixa, editável no painel admin. Carga, frete e status
  só vêm de API. Resposta da IA fora da lista cai na mensagem fixa padrão.
- **A IA não executa nada.** Quem encerra, oferece e dispara é o fluxo.
- **Sem conversa infinita.** O limite de respostas inválidas vale também com a IA.

## Etapas

| # | Etapa | Estado |
|---|---|---|
| 1 | IA quando o fluxo travar; documento direto; textos sem prometer atendente | v1.6 |
| 2 | Guardar o MDF-e encerrado na sessão (`contexto.ultimoMdfe`) | v1.6; falta ver no retorno real qual campo traz o destino |
| 3 | Opção 02: oferecer uma carga da região do destino; "ver mais" lista as cargas; mostrar o frete | Depende da API de cargas (não existe) |
| 4 | Com o "ok" do motorista, disparar a carga escolhida para os grupos da filial | Depende da regra região × filial |

## Em aberto

- Contrato da API de cargas: consulta por região; carga, frete e identificador.
- Regra região/filial → lista de grupos de WhatsApp (o dono vai definir).
- O disparo é pelo canal não oficial, então precisa de intervalo editável entre os
  envios e do aviso de risco de bloqueio (constituição, Princípio IX).
- O que o motorista recebe depois do "ok". Decidido só que ele recebe confirmação.

## Enquanto a API de cargas não existe

`cargas_ativo=false`: a opção 02 responde `msg_cargas_em_breve`, sem transferir.
