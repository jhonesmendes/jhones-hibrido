ALTER TABLE "member" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "member" ALTER COLUMN "role" SET DEFAULT 'agent';
--> statement-breakpoint
UPDATE "member" SET "role" = 'agent' WHERE "role" <> 'owner';
--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "assigned_to" text;
--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_assigned_to_member_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "member_permission" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"permission" text NOT NULL,
	"granted" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_permission" ADD CONSTRAINT "member_permission_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "member_permission_member_perm_uq" ON "member_permission" USING btree ("member_id","permission");
--> statement-breakpoint
CREATE TABLE "member_channel" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"channel_type" text NOT NULL,
	"can_view" boolean DEFAULT true NOT NULL,
	"can_send" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "member_channel" ADD CONSTRAINT "member_channel_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "member_channel_member_type_uq" ON "member_channel" USING btree ("member_id","channel_type");
--> statement-breakpoint
CREATE TABLE "invite_token" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"email" text,
	"role" text NOT NULL,
	"initial_permissions" jsonb,
	"initial_channels" jsonb,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"used_by" text,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "invite_token" ADD CONSTRAINT "invite_token_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invite_token" ADD CONSTRAINT "invite_token_used_by_member_id_fk" FOREIGN KEY ("used_by") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "invite_token" ADD CONSTRAINT "invite_token_created_by_member_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."member"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "invite_token_org_idx" ON "invite_token" USING btree ("organization_id");
--> statement-breakpoint
CREATE TABLE "smtp_config" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 587 NOT NULL,
	"secure" boolean DEFAULT false NOT NULL,
	"user" text NOT NULL,
	"password_cipher" text NOT NULL,
	"password_iv" text NOT NULL,
	"password_tag" text NOT NULL,
	"from_name" text NOT NULL,
	"from_email" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "smtp_config_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "smtp_config" ADD CONSTRAINT "smtp_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "password_reset_token" (
	"id" text PRIMARY KEY NOT NULL,
	"member_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "password_reset_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "password_reset_token" ADD CONSTRAINT "password_reset_token_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"member_id" text,
	"action" text NOT NULL,
	"resource" text,
	"resource_id" text,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_member_id_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "audit_log_org_created_idx" ON "audit_log" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "audit_log_org_member_idx" ON "audit_log" USING btree ("organization_id","member_id");
