CREATE TABLE "backup_config" (
	"id" text PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"hour_of_day" integer DEFAULT 3 NOT NULL,
	"retention_count" integer DEFAULT 7 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "db_backup" (
	"id" text PRIMARY KEY NOT NULL,
	"filename" text NOT NULL,
	"file_path" text NOT NULL,
	"size_bytes" integer,
	"status" text DEFAULT 'running' NOT NULL,
	"kind" text NOT NULL,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "db_restore_log" (
	"id" text PRIMARY KEY NOT NULL,
	"source_backup_id" text NOT NULL,
	"pre_restore_backup_id" text,
	"status" text DEFAULT 'running' NOT NULL,
	"error" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "db_restore_log" ADD CONSTRAINT "db_restore_log_source_backup_id_db_backup_id_fk" FOREIGN KEY ("source_backup_id") REFERENCES "public"."db_backup"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "db_restore_log" ADD CONSTRAINT "db_restore_log_pre_restore_backup_id_db_backup_id_fk" FOREIGN KEY ("pre_restore_backup_id") REFERENCES "public"."db_backup"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "db_backup_started_idx" ON "db_backup" USING btree ("started_at");