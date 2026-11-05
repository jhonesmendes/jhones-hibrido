ALTER TABLE "conversation" ADD COLUMN "department_pinned_at" timestamp;--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "location" jsonb;