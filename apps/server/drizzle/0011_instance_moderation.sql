CREATE TABLE "instance_domain_blocks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"domain" text NOT NULL,
	"severity" text NOT NULL,
	"public_comment" text DEFAULT '' NOT NULL,
	"private_comment" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instance_domain_blocks_domain_unique" UNIQUE("domain")
);
--> statement-breakpoint
CREATE TABLE "moderation_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"moderator_id" uuid,
	"action" text NOT NULL,
	"target" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "silenced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "moderation_log" ADD CONSTRAINT "moderation_log_moderator_id_accounts_id_fk" FOREIGN KEY ("moderator_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moderation_log_created_idx" ON "moderation_log" USING btree ("created_at");