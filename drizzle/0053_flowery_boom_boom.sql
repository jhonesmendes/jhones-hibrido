CREATE TABLE "media_config" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"retention_days" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message_media" ALTER COLUMN "data_base64" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "message_media" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "message_media" ADD COLUMN "purged_at" timestamp;--> statement-breakpoint
ALTER TABLE "media_config" ADD CONSTRAINT "media_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_media_org_created_idx" ON "message_media" USING btree ("organization_id","created_at");