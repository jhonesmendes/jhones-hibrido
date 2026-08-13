CREATE TABLE "admin_client" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"internal_secret_cipher" text NOT NULL,
	"internal_secret_iv" text NOT NULL,
	"internal_secret_tag" text NOT NULL,
	"contact_whatsapp" text,
	"contact_email" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
