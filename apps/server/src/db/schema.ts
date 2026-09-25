import type { AccountSettings, ProfileField, Visibility } from "@pinstripe/core";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  unique,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Everyone Pinstripe knows about: local accounts (domain null) and remote
 * ones it has seen through federation (domain set). One table, as in
 * Mastodon, so posts, follows and favourites can point at either.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    /** Null for local accounts; `host[:port]` for remote ones. */
    domain: text("domain"),
    displayName: text("display_name").notNull(),
    /** Plain text for local accounts; sanitized HTML for remote ones. */
    bio: text("bio").notNull().default(""),
    fields: jsonb("fields").$type<ProfileField[]>().notNull().default([]),
    bot: boolean("bot").notNull().default(false),
    settings: jsonb("settings").$type<AccountSettings>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Remote accounts only: where to find and reach them.
    uri: text("uri"),
    url: text("url"),
    inboxUri: text("inbox_uri"),
    sharedInboxUri: text("shared_inbox_uri"),
    followersUri: text("followers_uri"),
    avatarUrl: text("avatar_url"),
    headerUrl: text("header_url"),
    /** Local accounts only: uploaded avatar and banner, as media storage keys. */
    avatarKey: text("avatar_key"),
    headerKey: text("header_key"),
    /** As reported by the remote server; local counts are computed instead. */
    followersCount: integer("followers_count"),
    followingCount: integer("following_count"),
    statusesCount: integer("statuses_count"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    /** Set by a moderator: the account's posts are hidden, and a local one can't sign in. */
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  },
  (t) => [
    // Handles are case-insensitive: @Sam@x and @sam@x are the same person.
    uniqueIndex("accounts_handle_idx").on(sql`lower(${t.username})`, sql`lower(coalesce(${t.domain}, ''))`),
    uniqueIndex("accounts_uri_idx").on(t.uri),
  ],
);

export const accountKeys = pgTable(
  "account_keys",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    algorithm: text("algorithm").$type<"RSASSA-PKCS1-v1_5" | "Ed25519">().notNull(),
    privateKey: jsonb("private_key").$type<JsonWebKey>().notNull(),
    publicKey: jsonb("public_key").$type<JsonWebKey>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.algorithm] })],
);

/** Who follows whom, local or remote, including requests awaiting approval. */
export const follows = pgTable(
  "follows",
  {
    /** UUIDv7; also the tail of the Follow activity's id for follows we send. */
    id: uuid("id").notNull().unique(),
    followerId: uuid("follower_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    followingId: uuid("following_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    state: text("state").$type<"pending" | "accepted">().notNull(),
    /** The Follow activity's id, so a later Accept, Reject or Undo can be matched. */
    uri: text("uri"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.followerId, t.followingId] }),
    index("follows_following_idx").on(t.followingId, t.state),
    index("follows_uri_idx").on(t.uri),
  ],
);

/** Login credentials for a local account. Remote accounts never have one. */
export const users = pgTable(
  "users",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => accounts.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    locale: text("locale"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null until email confirmation lands; unused for now. */
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /** Moderators and admins see and act on reports. */
    role: text("role").$type<"user" | "moderator" | "admin">().notNull().default("user"),
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);

/** Registered OAuth clients (`POST /api/v1/apps`). */
export const oauthApps = pgTable("oauth_apps", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  website: text("website"),
  redirectUris: text("redirect_uris").array().notNull(),
  scopes: text("scopes").notNull(),
  clientId: text("client_id").notNull().unique(),
  /** SHA-256 of the secret; the secret itself is shown once, at registration. */
  clientSecretHash: text("client_secret_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Short-lived, single-use authorization codes. */
export const oauthCodes = pgTable("oauth_codes", {
  codeHash: text("code_hash").primaryKey(),
  appId: uuid("app_id")
    .notNull()
    .references(() => oauthApps.id, { onDelete: "cascade" }),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  scopes: text("scopes").notNull(),
  codeChallenge: text("code_challenge"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SHA-256 of the bearer token; tokens are never stored in the clear. */
    tokenHash: text("token_hash").notNull().unique(),
    appId: uuid("app_id")
      .notNull()
      .references(() => oauthApps.id, { onDelete: "cascade" }),
    /** Null for app-only tokens (client_credentials). */
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    scopes: text("scopes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("oauth_tokens_account_idx").on(t.accountId)],
);

/**
 * Posts, local and remote. Boosts are rows too, with `reblogOfId` set and no
 * text of their own, as in Mastodon.
 */
export const statuses = pgTable(
  "statuses",
  {
    /** UUIDv7, so ordering by id is ordering by time. */
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** What the author typed. */
    text: text("text").notNull().default(""),
    /** Rendered HTML: escaped text with links, hashtags and mentions. */
    content: text("content").notNull().default(""),
    visibility: text("visibility").$type<Visibility>().notNull(),
    inReplyToId: uuid("in_reply_to_id").references((): AnyPgColumn => statuses.id, { onDelete: "set null" }),
    /** Kept alongside inReplyToId: Mastodon's API and ActivityPub both need the parent's author. */
    inReplyToAccountId: uuid("in_reply_to_account_id").references(() => accounts.id, { onDelete: "set null" }),
    reblogOfId: uuid("reblog_of_id").references((): AnyPgColumn => statuses.id, { onDelete: "cascade" }),
    sensitive: boolean("sensitive").notNull().default(false),
    spoilerText: text("spoiler_text").notNull().default(""),
    language: text("language"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Pinstripe: how many signed-in people have watched it here (videos only). */
    viewsCount: integer("views_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Remote posts only: the Note's (or Announce's) ActivityPub id, and its web page. */
    uri: text("uri"),
    url: text("url"),
  },
  (t) => [
    uniqueIndex("statuses_uri_idx").on(t.uri),
    index("statuses_account_id_idx").on(t.accountId, t.id),
    index("statuses_reblog_of_idx").on(t.reblogOfId),
    index("statuses_in_reply_to_idx").on(t.inReplyToId),
    // Hashtag timelines.
    index("statuses_tags_idx").using("gin", t.tags),
    // One boost per account per post.
    uniqueIndex("statuses_one_reblog_idx").on(t.accountId, t.reblogOfId).where(sql`${t.reblogOfId} is not null`),
  ],
);

export const favourites = pgTable(
  "favourites",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    statusId: uuid("status_id")
      .notNull()
      .references(() => statuses.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.statusId] }), index("favourites_status_idx").on(t.statusId)],
);

/** Accounts mentioned in a post; they can see it even when it's direct. */
export const mentions = pgTable(
  "mentions",
  {
    statusId: uuid("status_id")
      .notNull()
      .references(() => statuses.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.statusId, t.accountId] }), index("mentions_account_idx").on(t.accountId)],
);

export interface MediaMeta {
  width: number | null;
  height: number | null;
  /** Seconds; videos only. */
  duration: number | null;
  /** Bytes of the processed file. */
  size: number | null;
}

/**
 * Photos and videos. Local uploads live in media storage under `fileKey`
 * (and `previewKey` for the thumbnail); remote ones are linked by URL.
 * An upload belongs to no status until it's attached to a post.
 */
export const mediaAttachments = pgTable(
  "media_attachments",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    statusId: uuid("status_id").references(() => statuses.id, { onDelete: "cascade" }),
    /** Order within the post. */
    position: integer("position").notNull().default(0),
    type: text("type").$type<"image" | "video">().notNull(),
    state: text("state").$type<"processing" | "ready" | "failed">().notNull(),
    contentType: text("content_type").notNull(),
    fileKey: text("file_key"),
    previewKey: text("preview_key"),
    remoteUrl: text("remote_url"),
    remotePreviewUrl: text("remote_preview_url"),
    meta: jsonb("meta").$type<MediaMeta>().notNull().default({ width: null, height: null, duration: null, size: null }),
    description: text("description").notNull().default(""),
    blurhash: text("blurhash"),
    /** Why processing failed, for the uploader. */
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("media_status_idx").on(t.statusId, t.position),
    index("media_unattached_idx").on(t.createdAt).where(sql`${t.statusId} is null`),
  ],
);

export type NotificationType = "mention" | "reblog" | "favourite" | "follow" | "follow_request";

/**
 * What happened to a local account: someone followed, asked to follow,
 * mentioned or replied, boosted or favourited. `statusId` is the mention,
 * the boost, or the favourited post. Undoing the action removes the
 * notification (cascades for boosts and mentions, explicit for the rest).
 */
export const notifications = pgTable(
  "notifications",
  {
    /** UUIDv7, so paging works as for statuses. */
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    fromAccountId: uuid("from_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    type: text("type").$type<NotificationType>().notNull(),
    statusId: uuid("status_id").references(() => statuses.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_account_idx").on(t.accountId, t.id),
    // A redelivered Like or Follow doesn't notify twice.
    unique("notifications_once").on(t.accountId, t.type, t.fromAccountId, t.statusId).nullsNotDistinct(),
  ],
);

/** Mastodon's read markers: how far someone has read, per timeline ("home", "notifications"). */
export const markers = pgTable(
  "markers",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    timeline: text("timeline").$type<"home" | "notifications">().notNull(),
    lastReadId: text("last_read_id").notNull(),
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.timeline] })],
);

/** `accountId` blocks `targetAccountId`. Either side may be remote (a remote Block of a local account is stored too). */
export const blocks = pgTable(
  "blocks",
  {
    /** UUIDv7, for paging the list. */
    id: uuid("id").notNull().unique(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    targetAccountId: uuid("target_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** The Block activity's id, so an Undo can be matched and sent. */
    uri: text("uri"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.targetAccountId] }), index("blocks_target_idx").on(t.targetAccountId)],
);

/** Hides someone's posts (and, unless `hideNotifications` is off, their notifications) from a local account. Never federated. */
export const mutes = pgTable(
  "mutes",
  {
    id: uuid("id").notNull().unique(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    targetAccountId: uuid("target_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    hideNotifications: boolean("hide_notifications").notNull().default(true),
    /** Null: until unmuted. */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.targetAccountId] })],
);

/** A local account hiding a whole server ("Blocked servers" in Settings). */
export const domainBlocks = pgTable(
  "domain_blocks",
  {
    id: uuid("id").notNull().unique(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.domain] })],
);

export type ReportCategory = "spam" | "legal" | "violation" | "other";

/** A report to this server's moderators, from a local account or (as a Flag) from another server. */
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    targetAccountId: uuid("target_account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    statusIds: uuid("status_ids").array().notNull().default(sql`'{}'::uuid[]`),
    comment: text("comment").notNull().default(""),
    category: text("category").$type<ReportCategory>().notNull().default("other"),
    /** Asked to be passed on to the target's server. */
    forward: boolean("forward").notNull().default(false),
    /** The Flag activity's id, for reports from elsewhere. */
    uri: text("uri"),
    actionTakenAt: timestamp("action_taken_at", { withTimezone: true }),
    actionTakenByAccountId: uuid("action_taken_by_account_id").references(() => accounts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reports_open_idx").on(t.id).where(sql`${t.actionTakenAt} is null`), uniqueIndex("reports_uri_idx").on(t.uri)],
);

/**
 * One-time links sent by email: confirming an address, resetting a
 * password. Stored as digests; used once; they expire.
 */
export const emailTokens = pgTable(
  "email_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"confirm" | "reset">().notNull(),
    /** The address the link was sent to; a confirmation only counts if it's still the account's. */
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_tokens_account_idx").on(t.accountId, t.kind)],
);

/** Who has watched which video, so each person counts once. */
export const statusViews = pgTable(
  "status_views",
  {
    statusId: uuid("status_id")
      .notNull()
      .references(() => statuses.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.statusId, t.accountId] })],
);
