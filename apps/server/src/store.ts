import { DEFAULT_SETTINGS, isValidUsername, type ProfileField } from "@pinstripe/core";
import { and, count, desc, eq, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "./db/client.ts";
import { accountKeys, accounts, follows } from "./db/schema.ts";
import { uuidv7 } from "./ids.ts";
import { generateKeyPairs, importKeyPairs } from "./keys.ts";

/** Any account Pinstripe knows: local (`domain` null) or remote. */
export type AccountRow = typeof accounts.$inferSelect;

/** An account hosted here. Same shape; the name documents that `domain` is null. */
export type LocalAccount = AccountRow;

export type FollowState = "pending" | "accepted";
export type FollowRow = typeof follows.$inferSelect;

/** What we learn about a remote account from its actor document. */
export interface RemoteAccountData {
  uri: string;
  username: string;
  domain: string;
  displayName: string;
  bio: string;
  fields: ProfileField[];
  bot: boolean;
  locked: boolean;
  discoverable: boolean;
  url: string | null;
  inboxUri: string;
  sharedInboxUri: string | null;
  followersUri: string | null;
  avatarUrl: string | null;
  headerUrl: string | null;
  followersCount: number | null;
  followingCount: number | null;
  statusesCount: number | null;
}

/** A remote account as Fedify needs it for delivery. */
export interface Recipient {
  uri: string;
  inboxUri: string;
  sharedInboxUri: string | null;
}

export interface Relationship {
  following: boolean;
  requested: boolean;
  followedBy: boolean;
  requestedBy: boolean;
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

type NewAccount = Pick<AccountRow, "username" | "displayName" | "bio" | "fields" | "bot" | "settings">;

export function newAccount(username: string, displayName?: string): NewAccount {
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

export const isLocal = (account: Pick<AccountRow, "domain">) => account.domain === null;

/** A remote account with somewhere to deliver to. */
export function asRecipient(account: AccountRow): Recipient | null {
  return account.uri && account.inboxUri
    ? { uri: account.uri, inboxUri: account.inboxUri, sharedInboxUri: account.sharedInboxUri }
    : null;
}

/** Accounts, signing keys and follows, in Postgres. */
export class Store {
  constructor(readonly db: Db) {}

  async createAccount({ username, displayName }: { username: string; displayName?: string }) {
    try {
      const [row] = await this.db.insert(accounts).values(newAccount(username, displayName)).returning();
      return row!;
    } catch (error) {
      if (isUniqueViolation(error)) throw new UsernameTakenError(username);
      throw error;
    }
  }

  async getAccount(id: string): Promise<AccountRow | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.db.select().from(accounts).where(eq(accounts.id, id));
    return row ?? null;
  }

  async getAccounts(ids: string[]): Promise<AccountRow[]> {
    const valid = ids.filter(isUuid);
    return valid.length ? this.db.select().from(accounts).where(inArray(accounts.id, valid)) : [];
  }

  /** Only accounts hosted here: actors, WebFinger and keys are local-only. */
  async getLocalAccount(id: string): Promise<LocalAccount | null> {
    const account = await this.getAccount(id);
    return account && isLocal(account) ? account : null;
  }

  async getAccountByUsername(username: string): Promise<LocalAccount | null> {
    return this.getAccountByHandle(username, null);
  }

  /** `domain` null means local. */
  async getAccountByHandle(username: string, domain: string | null): Promise<AccountRow | null> {
    const [row] = await this.db
      .select()
      .from(accounts)
      .where(
        and(
          sql`lower(${accounts.username}) = ${username.toLowerCase()}`,
          domain === null ? isNull(accounts.domain) : sql`lower(${accounts.domain}) = ${domain.toLowerCase()}`,
        ),
      );
    return row ?? null;
  }

  async getAccountByUri(uri: string): Promise<AccountRow | null> {
    const [row] = await this.db.select().from(accounts).where(eq(accounts.uri, uri));
    return row ?? null;
  }

  /** Inserts or refreshes a remote account, keyed by its actor URI. */
  async upsertRemoteAccount(data: RemoteAccountData): Promise<AccountRow> {
    const values = {
      uri: data.uri,
      username: data.username,
      domain: data.domain,
      displayName: data.displayName,
      bio: data.bio,
      fields: data.fields,
      bot: data.bot,
      url: data.url,
      inboxUri: data.inboxUri,
      sharedInboxUri: data.sharedInboxUri,
      followersUri: data.followersUri,
      avatarUrl: data.avatarUrl,
      headerUrl: data.headerUrl,
      followersCount: data.followersCount,
      followingCount: data.followingCount,
      statusesCount: data.statusesCount,
      fetchedAt: new Date(),
      settings: { ...DEFAULT_SETTINGS, approveFollowers: data.locked, listInDirectory: data.discoverable },
    };
    const [row] = await this.db
      .insert(accounts)
      .values(values)
      .onConflictDoUpdate({ target: accounts.uri, set: values })
      .returning();
    return row!;
  }

  async deleteAccount(id: string) {
    await this.db.delete(accounts).where(eq(accounts.id, id));
  }

  async countLocalAccounts() {
    const [row] = await this.db.select({ n: count() }).from(accounts).where(isNull(accounts.domain));
    return row?.n ?? 0;
  }

  /** Prefix search on username and display name; local accounts first. */
  async searchAccounts(query: string, limit: number): Promise<AccountRow[]> {
    const q = `${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.db
      .select()
      .from(accounts)
      .where(or(ilike(accounts.username, q), ilike(accounts.displayName, q)))
      .orderBy(sql`${accounts.domain} is not null`, sql`length(${accounts.username})`)
      .limit(limit);
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

  // Follows

  /**
   * Creates or updates a follow. `uri` is the Follow activity's id: given for
   * follows from elsewhere, or derived from the new row's id for ones we send.
   * An accepted follow is never downgraded to a request.
   */
  async follow(input: {
    followerId: string;
    followingId: string;
    state: FollowState;
    uri: string | null | ((id: string) => string);
  }): Promise<FollowRow> {
    const id = uuidv7();
    const uri = typeof input.uri === "function" ? input.uri(id) : input.uri;
    const [row] = await this.db
      .insert(follows)
      .values({ id, followerId: input.followerId, followingId: input.followingId, state: input.state, uri })
      .onConflictDoUpdate({
        target: [follows.followerId, follows.followingId],
        set: {
          state: sql`case when ${follows.state} = 'accepted' then 'accepted' else excluded.state end`,
          uri: sql`coalesce(excluded.uri, ${follows.uri})`,
        },
      })
      .returning();
    return row!;
  }

  async getFollow(followerId: string, followingId: string): Promise<FollowRow | null> {
    const [row] = await this.db
      .select()
      .from(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
    return row ?? null;
  }

  async getFollowByUri(uri: string): Promise<FollowRow | null> {
    const [row] = await this.db.select().from(follows).where(eq(follows.uri, uri));
    return row ?? null;
  }

  async acceptFollow(followerId: string, followingId: string) {
    await this.db
      .update(follows)
      .set({ state: "accepted" })
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)));
  }

  async unfollow(followerId: string, followingId: string): Promise<FollowRow | null> {
    const [row] = await this.db
      .delete(follows)
      .where(and(eq(follows.followerId, followerId), eq(follows.followingId, followingId)))
      .returning();
    return row ?? null;
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    return (await this.getFollow(followerId, followingId))?.state === "accepted";
  }

  /** Remote accounts that follow a local one, for delivery. */
  async remoteFollowers(accountId: string): Promise<Recipient[]> {
    const rows = await this.db
      .select()
      .from(follows)
      .innerJoin(accounts, eq(follows.followerId, accounts.id))
      .where(and(eq(follows.followingId, accountId), eq(follows.state, "accepted"), sql`${accounts.domain} is not null`));
    return rows.map((r) => asRecipient(r.accounts)).filter((r): r is Recipient => !!r);
  }

  async hasRemoteFollowers(accountId: string): Promise<boolean> {
    return (await this.remoteFollowers(accountId)).length > 0;
  }

  /** Does any local account follow this (remote) account? Decides whether its posts are worth storing. */
  async hasLocalFollowers(accountId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: follows.id })
      .from(follows)
      .innerJoin(accounts, eq(follows.followerId, accounts.id))
      .where(and(eq(follows.followingId, accountId), eq(follows.state, "accepted"), isNull(accounts.domain)))
      .limit(1);
    return !!row;
  }

  async followCounts(accountId: string): Promise<{ followers: number; following: number; requests: number }> {
    const [row] = await this.db
      .select({
        followers: sql<string>`count(*) filter (where ${follows.followingId} = ${accountId} and ${follows.state} = 'accepted')`,
        following: sql<string>`count(*) filter (where ${follows.followerId} = ${accountId} and ${follows.state} = 'accepted')`,
        requests: sql<string>`count(*) filter (where ${follows.followingId} = ${accountId} and ${follows.state} = 'pending')`,
      })
      .from(follows)
      .where(or(eq(follows.followerId, accountId), eq(follows.followingId, accountId)));
    return { followers: Number(row?.followers ?? 0), following: Number(row?.following ?? 0), requests: Number(row?.requests ?? 0) };
  }

  /**
   * A page of an account's followers, the accounts it follows, or its
   * pending follow requests. Paged by the follow's id (UUIDv7).
   */
  async followList(accountId: string, side: "followers" | "following" | "requests", page: { maxId?: string; limit: number }) {
    const mine = side === "following" ? follows.followerId : follows.followingId;
    const other = side === "following" ? follows.followingId : follows.followerId;
    return this.db
      .select({ followId: follows.id, account: accounts })
      .from(follows)
      .innerJoin(accounts, eq(other, accounts.id))
      .where(
        and(
          eq(mine, accountId),
          eq(follows.state, side === "requests" ? "pending" : "accepted"),
          page.maxId && isUuid(page.maxId) ? lt(follows.id, page.maxId) : undefined,
        ),
      )
      .orderBy(desc(follows.id))
      .limit(page.limit);
  }

  async relationships(viewerId: string, ids: string[]): Promise<Map<string, Relationship>> {
    const valid = ids.filter(isUuid);
    const result = new Map(valid.map((id) => [id, { following: false, requested: false, followedBy: false, requestedBy: false }]));
    if (!valid.length) return result;
    const rows = await this.db
      .select()
      .from(follows)
      .where(
        or(
          and(eq(follows.followerId, viewerId), inArray(follows.followingId, valid)),
          and(eq(follows.followingId, viewerId), inArray(follows.followerId, valid)),
        ),
      );
    for (const f of rows) {
      const mine = f.followerId === viewerId;
      const r = result.get(mine ? f.followingId : f.followerId);
      if (!r) continue;
      if (mine) {
        if (f.state === "accepted") r.following = true;
        else r.requested = true;
      } else if (f.state === "accepted") r.followedBy = true;
      else r.requestedBy = true;
    }
    return result;
  }
}
