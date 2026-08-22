CREATE TABLE "meta_pricing_rule" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"category" text NOT NULL,
	"price_brl" numeric(10, 6) NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "message" ADD COLUMN "meta_category" text;--> statement-breakpoint
ALTER TABLE "meta_pricing_rule" ADD CONSTRAINT "meta_pricing_rule_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "meta_pricing_rule_org_cat_idx" ON "meta_pricing_rule" USING btree ("organization_id","category","valid_from");