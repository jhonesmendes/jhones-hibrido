DROP INDEX "lead_contact_uq";--> statement-breakpoint
DROP INDEX "pipeline_followup_org_uq";--> statement-breakpoint
ALTER TABLE "lead" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "pipeline_followup" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "lead" ADD CONSTRAINT "lead_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_followup" ADD CONSTRAINT "pipeline_followup_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_contact_department_uq" ON "lead" USING btree ("contact_id","department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_followup_org_dept_uq" ON "pipeline_followup" USING btree ("organization_id","department_id");--> statement-breakpoint
-- Backfill: lead ja existente (departamento antes nao existia na tabela)
-- herda o departamento da conversa mais recentemente ativa do mesmo
-- contato -- sem isso todo lead antigo cairia no balde "sem departamento"
-- (so visivel na Visao consolidada do owner) mesmo tendo uma conversa real
-- ja roteada. So 1 lead por contato ainda (constraint antiga), entao nao
-- ha risco de colidir com a unique nova (contact_id, department_id).
UPDATE "lead" l
SET "department_id" = (
  SELECT c."department_id"
  FROM "conversation" c
  WHERE c."contact_id" = l."contact_id" AND c."is_test" = false
  ORDER BY COALESCE(c."last_message_at", c."created_at") DESC
  LIMIT 1
)
WHERE l."department_id" IS NULL;