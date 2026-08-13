CREATE TABLE "license" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type" text DEFAULT 'trial' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"max_official_numbers" integer DEFAULT 1 NOT NULL,
	"max_web_numbers" integer DEFAULT 1 NOT NULL,
	"max_departments" integer DEFAULT 1 NOT NULL,
	"max_admins" integer DEFAULT 1 NOT NULL,
	"max_agents" integer DEFAULT 3 NOT NULL,
	"addon_agents" integer DEFAULT 0 NOT NULL,
	"hide_owner" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"trial_ends_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "license_organization_id_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
ALTER TABLE "license" ADD CONSTRAINT "license_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;