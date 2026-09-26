CREATE TABLE "follows" (
	"id" uuid NOT NULL,
	"follower_id" uuid NOT NULL,
	"following_id" uuid NOT NULL,
	"state" text NOT NULL,
	"uri" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id"),
	CONSTRAINT "follows_id_unique" UNIQUE("id")
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"status_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	CONSTRAINT "mentions_status_id_account_id_pk" PRIMARY KEY("status_id","account_id")
);
--> statement-breakpoint
DROP INDEX "accounts_username_lower_idx";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "uri" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "inbox_uri" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "shared_inbox_uri" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "followers_uri" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "header_url" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "followers_count" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "following_count" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "statuses_count" integer;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "uri" text;--> statement-breakpoint
ALTER TABLE "statuses" ADD COLUMN "url" text;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_accounts_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_accounts_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "follows_following_idx" ON "follows" USING btree ("following_id","state");--> statement-breakpoint
CREATE INDEX "follows_uri_idx" ON "follows" USING btree ("uri");--> statement-breakpoint
CREATE INDEX "mentions_account_idx" ON "mentions" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_handle_idx" ON "accounts" USING btree (lower("username"),lower(coalesce("domain", '')));--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_uri_idx" ON "accounts" USING btree ("uri");--> statement-breakpoint
CREATE UNIQUE INDEX "statuses_uri_idx" ON "statuses" USING btree ("uri");