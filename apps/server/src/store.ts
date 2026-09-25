import { type AccountSettings, DEFAULT_SETTINGS, isValidUsername, type ProfileField } from "@pinstripe/core";
import { and, count, eq, sql } from "drizzle-orm";
import type { Db } from "./db/client.ts";
import { accountKeys, accounts, followers } from "./db/schema.ts";
import { generateKeyPairs, importKeyPairs } from "./keys.ts";

/** An account hosted on this server. Remote actors are never stored here. */
export interface LocalAccount {
  /** Stable internal id; also the ActivityPub actor identifier, so usernames can change. */
  id: string;
  username: string;
  displayName: string;
  bio: string;
  fields: ProfileField[];
  bot: boolean;
  createdAt: Date;
  settings: AccountSettings;
}

export type FollowState = "pending" | "accepted";

export interface RemoteFollower {
  actorUri: string;
  inboxUri: string;
  sharedInboxUri: string | null;
  /** IRI of the Follow activity, needed to Accept or Reject it later. */
  followActivityUri: string;
  state: FollowState;
}

export class InvalidUsernameError extends Error {
  constructor(username: string) {
    super(`Invalid username: ${username}`);
  }
}

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`Username taken: ${username}`);
  }
}

export function newAccount(username: string, displayName?: string): Omit<LocalAccount, "id" | "createdAt"> {
  if (!isValidUsername(username)) throw new InvalidUsernameError(username);
  return { username, displayName: displayName ?? username, bio: "", fields: [], bot: false, settings: { ...DEFAULT_SETTINGS } };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids arrive straight from URLs; anything that isn't a UUID can't match (and would make Postgres error). */
export function isUuid(id: string): boolean {
  return UUID.test(id);
}

const UNIQUE_VIOLATION = "23505";

export function isUniqueViolation(error: unknown): boolean {
  // Drizzle wraps driver errors; the Postgres error code sits on the cause.
  for (let e: unknown = error; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: string }).code === UNIQUE_VIOLATION) return true;
  }
  return false;
}

/** Accounts, signing keys and followers, in Postgres. */
export class Store {
  constructor(private readonly db: Db) {}

  async createAccount({ username, displayName }: { username: string; displayName?: string }) {
    try {
      const [row] = await this.db.insert(accounts).values(newAccount(username, displayName)).returning();
      return row!;
    } catch (error) {
      if (isUniqueViolation(error)) throw new UsernameTakenError(username);
      throw error;
    }
  }

  async getAccount(id: string): Promise<LocalAccount | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.db.select().from(accounts).where(eq(accounts.id, id));
    return row ?? null;
  }

  async getAccountByUsername(username: string): Promise<LocalAccount | null> {
    const [row] = await this.db
      .select()
      .from(accounts)
      .where(sql`lower(${accounts.username}) = ${username.toLowerCase()}`);
    return row ?? null;
  }

  async countAccounts() {
    const [row] = await this.db.select({ n: count() }).from(accounts);
    return row?.n ?? 0;
  }

  async getKeyPairs(accountId: string) {
    let stored = await this.db.select().from(accountKeys).where(eq(accountKeys.accountId, accountId));
    if (stored.length === 0) {
      // Two requests can race to create keys; the loser's insert is dropped
      // and both read back the winner's.
      const fresh = await generateKeyPairs();
      await this.db
        .insert(accountKeys)
        .values(fresh.map((k) => ({ accountId, ...k })))
        .onConflictDoNothing();
      stored = await this.db.select().from(accountKeys).where(eq(accountKeys.accountId, accountId));
    }
    return importKeyPairs(stored);
  }

  async upsertFollower(accountId: string, follower: RemoteFollower) {
    await this.db
      .insert(followers)
      .values({ accountId, ...follower })
      .onConflictDoUpdate({
        target: [followers.accountId, followers.actorUri],
        set: {
          inboxUri: follower.inboxUri,
          sharedInboxUri: follower.sharedInboxUri,
          followActivityUri: follower.followActivityUri,
          state: follower.state,
        },
      });
  }

  async removeFollower(accountId: string, actorUri: string) {
    await this.db
      .delete(followers)
      .where(and(eq(followers.accountId, accountId), eq(followers.actorUri, actorUri)));
  }

  async listFollowers(accountId: string, state?: FollowState): Promise<RemoteFollower[]> {
    const where = state
      ? and(eq(followers.accountId, accountId), eq(followers.state, state))
      : eq(followers.accountId, accountId);
    return this.db
      .select({
        actorUri: followers.actorUri,
        inboxUri: followers.inboxUri,
        sharedInboxUri: followers.sharedInboxUri,
        followActivityUri: followers.followActivityUri,
        state: followers.state,
      })
      .from(followers)
      .where(where)
      .orderBy(followers.createdAt);
  }
}
