CREATE TABLE "favourites" (
	"account_id" uuid NOT NULL,
	"status_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favourites_account_id_status_id_pk" PRIMARY KEY("account_id","status_id")
);
--> statement-breakpoint
CREATE TABLE "statuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"visibility" text NOT NULL,
	"in_reply_to_id" uuid,
	"in_reply_to_account_id" uuid,
	"reblog_of_id" uuid,
	"sensitive" boolean DEFAULT false NOT NULL,
	"spoiler_text" text DEFAULT '' NOT NULL,
	"language" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favourites" ADD CONSTRAINT "favourites_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_in_reply_to_id_statuses_id_fk" FOREIGN KEY ("in_reply_to_id") REFERENCES "public"."statuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_in_reply_to_account_id_accounts_id_fk" FOREIGN KEY ("in_reply_to_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statuses" ADD CONSTRAINT "statuses_reblog_of_id_statuses_id_fk" FOREIGN KEY ("reblog_of_id") REFERENCES "public"."statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "favourites_status_idx" ON "favourites" USING btree ("status_id");--> statement-breakpoint
CREATE INDEX "statuses_account_id_idx" ON "statuses" USING btree ("account_id","id");--> statement-breakpoint
CREATE INDEX "statuses_reblog_of_idx" ON "statuses" USING btree ("reblog_of_id");--> statement-breakpoint
CREATE INDEX "statuses_in_reply_to_idx" ON "statuses" USING btree ("in_reply_to_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statuses_one_reblog_idx" ON "statuses" USING btree ("account_id","reblog_of_id") WHERE "statuses"."reblog_of_id" is not null;