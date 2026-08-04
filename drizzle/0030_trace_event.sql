CREATE TABLE "trace_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"conversation_id" text,
	"type" text NOT NULL,
	"channel" text,
	"channel_id" text,
	"member_id" text,
	"detail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trace_event" ADD CONSTRAINT "trace_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_event" ADD CONSTRAINT "trace_event_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trace_event" ADD CONSTRAINT "trace_event_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trace_event_conversation_idx" ON "trace_event" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "trace_event_org_created_idx" ON "trace_event" USING btree ("organization_id","created_at");