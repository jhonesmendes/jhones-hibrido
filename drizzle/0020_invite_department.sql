ALTER TABLE "invite_token" ADD COLUMN "initial_department_id" text;--> statement-breakpoint
ALTER TABLE "invite_token" ADD COLUMN "initial_department_role" text;--> statement-breakpoint
ALTER TABLE "invite_token" ADD CONSTRAINT "invite_token_initial_department_id_department_id_fk" FOREIGN KEY ("initial_department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;