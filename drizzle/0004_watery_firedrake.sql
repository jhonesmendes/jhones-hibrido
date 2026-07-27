CREATE TABLE "followup_send" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"lead_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"message" text NOT NULL,
	"status" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "pipeline_followup" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"trigger_stage_id" text,
	"interval_value" integer DEFAULT 4 NOT NULL,
	"interval_unit" text DEFAULT 'hours' NOT NULL,
	"message" text,
	"success_stage_id" text,
	"expired_stage_id" text,
	"requires_document" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "followup_send" ADD CONSTRAINT "followup_send_lead_id_lead_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."lead"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followup_send" ADD CONSTRAINT "followup_send_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_followup" ADD CONSTRAINT "pipeline_followup_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_followup" ADD CONSTRAINT "pipeline_followup_trigger_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("trigger_stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_followup" ADD CONSTRAINT "pipeline_followup_success_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("success_stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_followup" ADD CONSTRAINT "pipeline_followup_expired_stage_id_pipeline_stage_id_fk" FOREIGN KEY ("expired_stage_id") REFERENCES "public"."pipeline_stage"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "followup_send_lead_active_uq" ON "followup_send" USING btree ("lead_id") WHERE "followup_send"."status" = 'sent';--> statement-breakpoint
CREATE INDEX "followup_send_org_idx" ON "followup_send" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_followup_org_uq" ON "pipeline_followup" USING btree ("organization_id");