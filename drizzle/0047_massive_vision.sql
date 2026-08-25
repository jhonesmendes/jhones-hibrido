CREATE TABLE "lab_persona" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"department_id" text,
	"name" text NOT NULL,
	"scenario_description" text NOT NULL,
	"script" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_test_case" ADD COLUMN "script" jsonb;--> statement-breakpoint
ALTER TABLE "lab_persona" ADD CONSTRAINT "lab_persona_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lab_persona" ADD CONSTRAINT "lab_persona_department_id_department_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lab_persona_org_idx" ON "lab_persona" USING btree ("organization_id");