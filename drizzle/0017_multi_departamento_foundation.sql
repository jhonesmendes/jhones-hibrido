CREATE TABLE "department" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#1d4ed8',
	"icon" text DEFAULT 'building',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_department" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"department_id" text NOT NULL,
	"role" text DEFAULT 'agent' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_department_permission" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"department_id" text NOT NULL,
	"permission" text NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "meta_credentials_org_uq";--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "kb_entry" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "name" text DEFAULT 'Principal' NOT NULL;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "pipeline_stage" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_department_id" text;--> statement-breakpoint
ALTER TABLE "template" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "unofficial_channel" ADD COLUMN "department_id" text;--> statement-breakpoint
ALTER TABLE "unofficial_channel" ADD COLUMN "name" text DEFAULT 'WhatsApp' NOT NULL;--> statement-breakpoint
ALTER TABLE "unofficial_channel" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "unofficial_channel" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_department" ADD CONSTRAINT "member_department_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_department" ADD CONSTRAINT "member_department_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_department_permission" ADD CONSTRAINT "member_department_permission_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_department_permission" ADD CONSTRAINT "member_department_permission_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "department_org_slug_uq" ON "department" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "member_department_member_dept_uq" ON "member_department" USING btree ("member_id","department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "member_department_permission_uq" ON "member_department_permission" USING btree ("member_id","department_id","permission");--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kb_entry" ADD CONSTRAINT "kb_entry_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meta_credentials" ADD CONSTRAINT "meta_credentials_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_stage" ADD CONSTRAINT "pipeline_stage_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_department_id_department_id_fk" FOREIGN KEY ("active_department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template" ADD CONSTRAINT "template_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "unofficial_channel" ADD CONSTRAINT "unofficial_channel_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;