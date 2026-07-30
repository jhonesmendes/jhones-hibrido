ALTER TABLE "contact" ADD COLUMN "avatar_base64" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "avatar_mime_type" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "avatar_updated_at" timestamp;