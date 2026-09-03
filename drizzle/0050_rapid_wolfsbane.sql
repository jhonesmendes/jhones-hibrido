ALTER TABLE "followup_send" ADD COLUMN "attempt_number" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_followup" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_followup" ADD COLUMN "stale_conversation_days" integer DEFAULT 90 NOT NULL;