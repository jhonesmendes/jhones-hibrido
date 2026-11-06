-- Bot MDF-e motorista — migration v1.6
-- Banco: vocero_sankhya (Postgres 16)
-- Rodar: docker exec -i sankhya_vocero-postgres-1 psql -v ON_ERROR_STOP=1 -U postgres -d vocero_sankhya < 01-migration-bot-mdfe.sql
-- Re-executável. Não sobrescreve textos já editados.

BEGIN;

CREATE TABLE IF NOT EXISTS bot_fluxo_config (
  id          serial PRIMARY KEY,
  fluxo       text NOT NULL,
  chave       text NOT NULL,
  valor       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fluxo, chave)
);

CREATE TABLE IF NOT EXISTS bot_sessao (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo              text NOT NULL,
  telefone           text NOT NULL,                -- contact.phone do evento do Vocero
  conversation_id    text,                         -- conversationId do evento
  estado             text NOT NULL DEFAULT 'INICIO',
  contexto           jsonb NOT NULL DEFAULT '{}'::jsonb,
  tentativas         int  NOT NULL DEFAULT 0,
  ultimo_arquivo_em  timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fluxo, telefone)
);

-- A entrega do Vocero é "pelo menos uma vez": cada eventId só é tratado uma vez.
CREATE TABLE IF NOT EXISTS bot_evento_processado (
  event_id    text PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Uma linha por chamada à API /mdfe/validar
CREATE TABLE IF NOT EXISTS mdfe_atendimento (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id        uuid NOT NULL REFERENCES bot_sessao(id),
  conversation_id  text,
  telefone         text NOT NULL,
  http_status      int,                            -- null = não chegou a chamar (falha local)
  status           text,                           -- encerrado | validado | divergente | erro | falha_local
  codigo           text,                           -- ENCERRADO, CHAVE_ILEGIVEL, ... ou motivo local
  protocolo        text,                           -- id da chamada no log da API
  chave_mdfe       text,                           -- null quando o telefone não confere
  numero_mdfe      text,
  mensagem         text,                           -- texto devolvido pela API ao motorista
  retorno_api      jsonb,                          -- corpo completo da resposta
  encerrado_em     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mdfe_atendimento_chave_idx ON mdfe_atendimento (chave_mdfe);
CREATE INDEX IF NOT EXISTS mdfe_atendimento_tel_idx   ON mdfe_atendimento (telefone, created_at DESC);

-- Os bytes ficam no Vocero; aqui só o vínculo com a mensagem.
CREATE TABLE IF NOT EXISTS mdfe_atendimento_arquivo (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id  uuid NOT NULL REFERENCES mdfe_atendimento(id),
  message_id      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (atendimento_id, message_id)
);

-- Última mensagem recebida: a reentrega de uma mais antiga não recebe resposta.
ALTER TABLE bot_sessao ADD COLUMN IF NOT EXISTS ultimo_evento_em timestamptz;

INSERT INTO bot_fluxo_config (fluxo, chave, valor) VALUES
('motorista_mdfe','msg_saudacao','Olá! 👋 Aqui é o atendimento da Fibra Forte para motoristas.'),
('motorista_mdfe','msg_menu','Escolha uma opção:\n01 - Encerrar MDF-e\n02 - Ver cargas na minha região'),
('motorista_mdfe','msg_opcao_invalida','Não entendi. Responda com 01 ou 02.'),
('motorista_mdfe','msg_pedir_damdfe','Envie a foto ou o PDF do DAMDFE (documento do MDF-e). Pode ser 1 PDF ou até 3 fotos. Mande do celular cadastrado como motorista da viagem.'),
('motorista_mdfe','msg_pedir_arquivo','Preciso do DAMDFE em foto (JPG, PNG) ou PDF.'),
('motorista_mdfe','msg_conferindo','Recebi. Estou conferindo o documento, isso pode levar até 1 minuto…'),
('motorista_mdfe','msg_aguarde','Ainda estou conferindo o documento anterior, só um instante.'),
('motorista_mdfe','msg_pos_encerrado','Para encerrar outro MDF-e, envie o próximo DAMDFE. Para voltar ao menu, envie 0.'),
('motorista_mdfe','msg_reenviar','Envie novamente o DAMDFE.'),
('motorista_mdfe','msg_operacao','Vou te passar para um atendente da operação.'),
('motorista_mdfe','msg_em_processamento','Reenvie o DAMDFE daqui a alguns minutos.'),
('motorista_mdfe','msg_arquivo_grande','O arquivo ficou grande demais (limite de 15 MB). Envie uma foto menor ou o PDF.'),
('motorista_mdfe','msg_arquivo_ilegivel','Não consegui abrir esse arquivo. Envie outra foto ou o PDF do DAMDFE.'),
('motorista_mdfe','msg_indisponivel','O sistema de conferência está indisponível agora. Tente novamente mais tarde.'),
('motorista_mdfe','msg_erro_tecnico','Tivemos um problema técnico. Um atendente vai continuar com você.'),
('motorista_mdfe','msg_transbordo','Não consegui concluir por aqui. Vou te passar para um atendente.'),
('motorista_mdfe','msg_pedir_localizacao','Para ver as cargas disponíveis, envie sua localização 📍 ou digite sua cidade.'),
('motorista_mdfe','msg_cargas_recebido','Recebemos sua localização. Um atendente vai te enviar as cargas disponíveis na sua região.'),
('motorista_mdfe','max_tentativas_documento','3'),
('motorista_mdfe','janela_arquivos_seg','20'),
('motorista_mdfe','timeout_sessao_min','60'),
('motorista_mdfe','departamento_transbordo','Geral Fibra Forte'),
('motorista_mdfe','api_mdfe_base_url','https://cnh.fibraforte.agr.br'),
('motorista_mdfe','vocero_url','https://sankhya.vocero.com.br'),
('motorista_mdfe','contato_alerta','5566999679169'),
('motorista_mdfe','max_respostas_invalidas','3'),
('motorista_mdfe','alerta_intervalo_seg','60'),
('motorista_mdfe','msg_encerrado','Seu MDF-e foi encerrado.'),
('motorista_mdfe','msg_ia_como_enviar','Envie aqui a foto ou o PDF do DAMDFE, do celular cadastrado como motorista da viagem.'),
('motorista_mdfe','msg_ia_fora_escopo','Por aqui só consigo ajudar a encerrar o MDF-e. Para isso, envie a foto ou o PDF do DAMDFE.'),
('motorista_mdfe','msg_cargas_em_breve','A consulta de cargas ainda não está disponível por aqui.'),
('motorista_mdfe','ia_ativa','true'),
('motorista_mdfe','ia_modelo','gpt-4o-mini'),
('motorista_mdfe','ia_base_url','https://api.openai.com/v1'),
('motorista_mdfe','cargas_ativo','false'),
('motorista_mdfe','msg_voltar_menu','Deseja voltar ao menu? Envie 0.'),
('motorista_mdfe','email_alerta_para',''),
('motorista_mdfe','email_remetente',''),
('motorista_mdfe','email_intervalo_seg','60'),
('motorista_mdfe','n8n_url','https://n8n.sankhya.vocero.com.br')
ON CONFLICT (fluxo, chave) DO NOTHING;

-- Operação sem atendente: troca os textos que prometiam um, só se ainda não foram editados.
UPDATE bot_fluxo_config SET valor = 'Não consegui concluir por aqui. Envie o DAMDFE de novo ou tente mais tarde.', updated_at = now()
 WHERE fluxo = 'motorista_mdfe' AND chave = 'msg_transbordo' AND valor = 'Não consegui concluir por aqui. Vou te passar para um atendente.';
UPDATE bot_fluxo_config SET valor = 'Tivemos um problema técnico. Tente novamente em alguns minutos.', updated_at = now()
 WHERE fluxo = 'motorista_mdfe' AND chave = 'msg_erro_tecnico' AND valor = 'Tivemos um problema técnico. Um atendente vai continuar com você.';
UPDATE bot_fluxo_config SET valor = 'Esse caso precisa da operação. Nossa equipe já foi avisada.', updated_at = now()
 WHERE fluxo = 'motorista_mdfe' AND chave = 'msg_operacao' AND valor = 'Vou te passar para um atendente da operação.';

COMMIT;

-- Conferência (40 linhas)
-- SELECT chave, valor FROM bot_fluxo_config WHERE fluxo = 'motorista_mdfe' ORDER BY chave;
