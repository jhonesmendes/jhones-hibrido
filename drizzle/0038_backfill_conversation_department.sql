-- Backfill: conversas antigas (criadas antes do filtro estrito de
-- departamento em listConversations) ficaram órfãs de department_id e
-- sumiram das caixas de entrada filtradas por departamento — mesmo já
-- tendo um canal (número oficial ou WhatsApp Web) vinculado a um
-- departamento. Preenche o departamento da conversa a partir do canal que
-- ela já usa, só onde ainda está null (idempotente, não sobrescreve nada).
--> statement-breakpoint
UPDATE "conversation" AS c
SET "department_id" = mc."department_id"
FROM "meta_credentials" AS mc
WHERE c."meta_credential_id" = mc."id"
  AND c."department_id" IS NULL
  AND mc."department_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "conversation" AS c
SET "department_id" = uc."department_id"
FROM "unofficial_channel" AS uc
WHERE c."unofficial_channel_id" = uc."id"
  AND c."department_id" IS NULL
  AND uc."department_id" IS NOT NULL;
