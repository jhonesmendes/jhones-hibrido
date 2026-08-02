DROP INDEX "unofficial_channel_org_uq";--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "unofficial_channel_id" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_unofficial_channel_id_unofficial_channel_id_fk" FOREIGN KEY ("unofficial_channel_id") REFERENCES "public"."unofficial_channel"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "unofficial_channel_org_idx" ON "unofficial_channel" USING btree ("organization_id");