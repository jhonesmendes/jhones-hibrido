CREATE TABLE "campaign_media" (
	"campaign_id" text PRIMARY KEY NOT NULL,
	"data_base64" text NOT NULL,
	"mime_type" text NOT NULL,
	"filename" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_media" ADD CONSTRAINT "campaign_media_campaign_id_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaign"("id") ON DELETE cascade ON UPDATE no action;