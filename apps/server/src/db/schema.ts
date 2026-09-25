import type { AccountSettings, ProfileField } from "@pinstripe/core";
import { sql } from "drizzle-orm";
import { boolean, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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
