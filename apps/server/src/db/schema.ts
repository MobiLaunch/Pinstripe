import type { AccountSettings, ProfileField } from "@pinstripe/core";
import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    bio: text("bio").notNull().default(""),
    fields: jsonb("fields").$type<ProfileField[]>().notNull().default([]),
    bot: boolean("bot").notNull().default(false),
    settings: jsonb("settings").$type<AccountSettings>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Handles are case-insensitive on the fediverse: @Sam and @sam are the same person.
  (t) => [uniqueIndex("accounts_username_lower_idx").on(sql`lower(${t.username})`)],
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

export const followers = pgTable(
  "followers",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    actorUri: text("actor_uri").notNull(),
    inboxUri: text("inbox_uri").notNull(),
    sharedInboxUri: text("shared_inbox_uri"),
    followActivityUri: text("follow_activity_uri").notNull(),
    state: text("state").$type<"pending" | "accepted">().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.actorUri] })],
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
