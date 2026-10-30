CREATE TABLE "message_media_pending" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"message_id" text NOT NULL,
	"source_cipher" text NOT NULL,
	"source_iv" text NOT NULL,
	"source_tag" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_attempt_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_media_pending_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
ALTER TABLE "message_media_pending" ADD CONSTRAINT "message_media_pending_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_media_pending" ADD CONSTRAINT "message_media_pending_message_id_message_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."message"("id") ON DELETE cascade ON UPDATE no action;