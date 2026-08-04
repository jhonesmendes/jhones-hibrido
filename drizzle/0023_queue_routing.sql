CREATE TABLE "agent_status" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"status" text DEFAULT 'offline' NOT NULL,
	"max_conversations" integer DEFAULT 5 NOT NULL,
	"current_conversations" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_status_member_id_unique" UNIQUE("member_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"department_id" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"assigned_to" text,
	"assigned_at" timestamp,
	"accepted_at" timestamp,
	"timeout_at" timestamp,
	"attempt" integer DEFAULT 1 NOT NULL,
	"position" integer,
	"selection_sent_at" timestamp,
	"client_choice" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "queue_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "routing_mode" text DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "distribution_mode" text DEFAULT 'round-robin';--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "selection_greeting" text;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "selection_format" text DEFAULT 'numbered';--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "selection_show_only_online" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "selection_timeout_seconds" integer DEFAULT 105;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "selection_timeout_action" text DEFAULT 'auto-assign';--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "accept_timeout_seconds" integer DEFAULT 120;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "accept_timeout_action" text DEFAULT 'next-agent';--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "max_conversations_per_agent" integer DEFAULT 5;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "max_queue_size" integer DEFAULT 50;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "queue_message" text;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "no_agents_message" text;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "offline_message" text;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "transfer_message" text;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "away_message" text;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "business_hours" jsonb;--> statement-breakpoint
ALTER TABLE "agent_status" ADD CONSTRAINT "agent_status_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_queue" ADD CONSTRAINT "conversation_queue_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_queue" ADD CONSTRAINT "conversation_queue_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_queue" ADD CONSTRAINT "conversation_queue_assigned_to_member_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;