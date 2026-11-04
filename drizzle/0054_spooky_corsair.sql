CREATE TABLE "n8n_inbound_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"message_id" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_attempt_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "n8n_inbound_event_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "n8n_config" ADD COLUMN "inbound_webhook_url" text;--> statement-breakpoint
ALTER TABLE "n8n_config" ADD COLUMN "inbound_token_cipher" text;--> statement-breakpoint
ALTER TABLE "n8n_config" ADD COLUMN "inbound_token_iv" text;--> statement-breakpoint
ALTER TABLE "n8n_config" ADD COLUMN "inbound_token_tag" text;--> statement-breakpoint
ALTER TABLE "n8n_inbound_event" ADD CONSTRAINT "n8n_inbound_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "n8n_inbound_event" ADD CONSTRAINT "n8n_inbound_event_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "n8n_inbound_event_attempts_idx" ON "n8n_inbound_event" USING btree ("attempts","last_attempt_at");