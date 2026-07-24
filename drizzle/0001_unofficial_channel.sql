CREATE TABLE "unofficial_channel" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"provider" text NOT NULL,
	"base_url" text NOT NULL,
	"instance_name" text NOT NULL,
	"api_key_cipher" text NOT NULL,
	"api_key_iv" text NOT NULL,
	"api_key_tag" text NOT NULL,
	"webhook_token" text NOT NULL,
	"display_phone_number" text,
	"status" text DEFAULT 'disconnected' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "channel" text DEFAULT 'official' NOT NULL;--> statement-breakpoint
ALTER TABLE "unofficial_channel" ADD CONSTRAINT "unofficial_channel_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unofficial_channel_org_uq" ON "unofficial_channel" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "unofficial_channel_webhook_uq" ON "unofficial_channel" USING btree ("webhook_token");