-- Custom SQL migration file, put your code below! --
-- Motor no oficial nativo (Baileys): sale todo lo específico de gateway,
-- entra la sesión cifrada única. Sin datos de producción que migrar (dev).
DROP INDEX IF EXISTS "unofficial_channel_webhook_uq";
--> statement-breakpoint
ALTER TABLE "unofficial_channel" DROP COLUMN IF EXISTS "provider";
--> statement-breakpoint
ALTER TABLE "unofficial_channel" DROP COLUMN IF EXISTS "base_url";
--> statement-breakpoint
ALTER TABLE "unofficial_channel" DROP COLUMN IF EXISTS "instance_name";
--> statement-breakpoint
ALTER TABLE "unofficial_channel" DROP COLUMN IF EXISTS "api_key_cipher";
--> statement-breakpoint
ALTER TABLE "unofficial_channel" DROP COLUMN IF EXISTS "api_key_iv";
--> statement-breakpoint
ALTER TABLE "unofficial_channel" DROP COLUMN IF EXISTS "api_key_tag";
--> statement-breakpoint
ALTER TABLE "unofficial_channel" DROP COLUMN IF EXISTS "webhook_token";
--> statement-breakpoint
ALTER TABLE "unofficial_channel" ADD COLUMN "auth_state_cipher" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "unofficial_channel" ADD COLUMN "auth_state_iv" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "unofficial_channel" ADD COLUMN "auth_state_tag" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "unofficial_channel" ALTER COLUMN "auth_state_cipher" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "unofficial_channel" ALTER COLUMN "auth_state_iv" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "unofficial_channel" ALTER COLUMN "auth_state_tag" DROP DEFAULT;
