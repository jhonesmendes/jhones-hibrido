DROP INDEX "agent_profile_org_uq";--> statement-breakpoint
ALTER TABLE "conversation" ADD COLUMN "agent_profile_id" text;--> statement-breakpoint
ALTER TABLE "department" ADD COLUMN "agent_profile_id" text;--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "agent_profile_id" text;--> statement-breakpoint
ALTER TABLE "conversation" ADD CONSTRAINT "conversation_agent_profile_id_agent_profile_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department" ADD CONSTRAINT "department_agent_profile_id_agent_profile_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_agent_profile_id_agent_profile_id_fk" FOREIGN KEY ("agent_profile_id") REFERENCES "public"."agent_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_profile_org_idx" ON "agent_profile" USING btree ("organization_id");