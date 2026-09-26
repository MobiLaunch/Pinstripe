CREATE TABLE "media_attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"status_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"type" text NOT NULL,
	"state" text NOT NULL,
	"content_type" text NOT NULL,
	"file_key" text,
	"preview_key" text,
	"remote_url" text,
	"remote_preview_url" text,
	"meta" jsonb DEFAULT '{"width":null,"height":null,"duration":null,"size":null}'::jsonb NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"blurhash" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "avatar_key" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "header_key" text;--> statement-breakpoint
ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_attachments" ADD CONSTRAINT "media_attachments_status_id_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."statuses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_status_idx" ON "media_attachments" USING btree ("status_id","position");--> statement-breakpoint
CREATE INDEX "media_unattached_idx" ON "media_attachments" USING btree ("created_at") WHERE "media_attachments"."status_id" is null;