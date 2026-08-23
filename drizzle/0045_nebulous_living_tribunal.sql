ALTER TABLE "conversation" ADD COLUMN "last_outbound_at" timestamp;--> statement-breakpoint
ALTER TABLE "pipeline_followup" ADD COLUMN "template_id" text;--> statement-breakpoint
ALTER TABLE "pipeline_followup" ADD CONSTRAINT "pipeline_followup_template_id_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."template"("id") ON DELETE set null ON UPDATE no action;