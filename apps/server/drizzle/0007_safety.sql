CREATE TABLE "blocks" (
	"id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"target_account_id" uuid NOT NULL,
	"uri" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_account_id_target_account_id_pk" PRIMARY KEY("account_id","target_account_id"),
	CONSTRAINT "blocks_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "domain_blocks" (
	"id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"domain" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domain_blocks_account_id_domain_pk" PRIMARY KEY("account_id","domain"),
	CONSTRAINT "domain_blocks_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "mutes" (
	"id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"target_account_id" uuid NOT NULL,
	"hide_notifications" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mutes_account_id_target_account_id_pk" PRIMARY KEY("account_id","target_account_id"),
	CONSTRAINT "mutes_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"target_account_id" uuid NOT NULL,
	"status_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"comment" text DEFAULT '' NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"forward" boolean DEFAULT false NOT NULL,
	"uri" text,
	"action_taken_at" timestamp with time zone,
	"action_taken_by_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_target_account_id_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_blocks" ADD CONSTRAINT "domain_blocks_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mutes" ADD CONSTRAINT "mutes_target_account_id_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_target_account_id_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_action_taken_by_account_id_accounts_id_fk" FOREIGN KEY ("action_taken_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_target_idx" ON "blocks" USING btree ("target_account_id");--> statement-breakpoint
CREATE INDEX "reports_open_idx" ON "reports" USING btree ("id") WHERE "reports"."action_taken_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_uri_idx" ON "reports" USING btree ("uri");