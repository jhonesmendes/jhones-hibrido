ALTER TABLE "session" DROP CONSTRAINT "session_active_department_id_department_id_fk";
--> statement-breakpoint
ALTER TABLE "member" ADD COLUMN "active_department_id" text;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_active_department_id_department_id_fk" FOREIGN KEY ("active_department_id") REFERENCES "public"."department"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" DROP COLUMN "active_department_id";