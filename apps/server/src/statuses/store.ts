import type { Visibility } from "@pinstripe/core";
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, type SQL } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { accounts, favourites, statuses } from "../db/schema.ts";
import { uuidv7 } from "../ids.ts";
import { isUniqueViolation, isUuid, type LocalAccount } from "../store.ts";

export type StatusRow = typeof statuses.$inferSelect;

/** A status with everything needed to show it. */
export interface StatusView {
  status: StatusRow;
  account: LocalAccount;
  /** For boosts: the boosted status. */
  reblog: StatusView | null;
  counts: { replies: number; reblogs: number; favourites: number };
  /** Null when nobody is signed in. */
  viewer: { favourited: boolean; reblogged: boolean } | null;
}

/** Mastodon-style paging. Ids are UUIDv7, so id order is time order. */
export interface Page {
  maxId?: string;
  sinceId?: string;
  minId?: string;
  limit: number;
}

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 40;

export class StatusStore {
  constructor(private readonly db: Db) {}

  async create(input: {
    accountId: string;
    text: string;
    content: string;
    tags: string[];
    visibility: Visibility;
    inReplyToId: string | null;
    inReplyToAccountId: string | null;
    sensitive: boolean;
    spoilerText: string;
    language: string | null;
  }): Promise<StatusRow> {
    const [row] = await this.db
      .insert(statuses)
      .values({ id: uuidv7(), ...input })
      .returning();
    return row!;
  }

  async get(id: string): Promise<StatusRow | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.db.select().from(statuses).where(eq(statuses.id, id));
    return row ?? null;
  }

  /** Deletes a status and, through cascades, its boosts and favourites. */
  async delete(id: string): Promise<void> {
    await this.db.delete(statuses).where(eq(statuses.id, id));
  }

  /** The account's boost of a status, if any. */
  async findReblog(accountId: string, statusId: string): Promise<StatusRow | null> {
    const [row] = await this.db
      .select()
      .from(statuses)
      .where(and(eq(statuses.accountId, accountId), eq(statuses.reblogOfId, statusId)));
    return row ?? null;
  }

  /** Boosting twice returns the existing boost. */
  async reblog(accountId: string, statusId: string, visibility: Visibility): Promise<{ row: StatusRow; created: boolean }> {
    const existing = await this.findReblog(accountId, statusId);
    if (existing) return { row: existing, created: false };
    try {
      const [row] = await this.db
        .insert(statuses)
        .values({ id: uuidv7(), accountId, reblogOfId: statusId, visibility })
        .returning();
      return { row: row!, created: true };
    } catch (error) {
      // Two taps racing: the other one won.
      if (!isUniqueViolation(error)) throw error;
      return { row: (await this.findReblog(accountId, statusId))!, created: false };
    }
  }

  async unreblog(accountId: string, statusId: string): Promise<StatusRow | null> {
    const [row] = await this.db
      .delete(statuses)
      .where(and(eq(statuses.accountId, accountId), eq(statuses.reblogOfId, statusId)))
      .returning();
    return row ?? null;
  }

  async favourite(accountId: string, statusId: string) {
    await this.db.insert(favourites).values({ accountId, statusId }).onConflictDoNothing();
  }

  async unfavourite(accountId: string, statusId: string) {
    await this.db.delete(favourites).where(and(eq(favourites.accountId, accountId), eq(favourites.statusId, statusId)));
  }

  /** Local posts (not boosts), for NodeInfo. */
  async countAll(): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(statuses).where(isNull(statuses.reblogOfId));
    return row?.n ?? 0;
  }

  async countByAccount(accountId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(statuses)
      .where(and(eq(statuses.accountId, accountId), isNull(statuses.reblogOfId)));
    return row?.n ?? 0;
  }

  /** A profile's posts. Others see public and unlisted ones; the author sees everything. */
  accountStatuses(accountId: string, page: Page, options: { viewerId: string | null; excludeReblogs?: boolean }) {
    const conditions: SQL[] = [eq(statuses.accountId, accountId)];
    if (options.viewerId !== accountId) conditions.push(inArray(statuses.visibility, ["public", "unlisted"]));
    if (options.excludeReblogs) conditions.push(isNull(statuses.reblogOfId));
    return this.#page(and(...conditions)!, page);
  }

  /** Local and Federated timelines: public posts, no boosts (as in Mastodon). */
  publicTimeline(page: Page) {
    return this.#page(and(eq(statuses.visibility, "public"), isNull(statuses.reblogOfId))!, page);
  }

  /**
   * Home: your own posts and boosts. Posts from accounts you follow join
   * this once following lands.
   */
  homeTimeline(accountId: string, page: Page) {
    return this.#page(eq(statuses.accountId, accountId), page);
  }

  async #page(where: SQL, page: Page): Promise<StatusRow[]> {
    const conditions = [where];
    if (page.maxId && isUuid(page.maxId)) conditions.push(lt(statuses.id, page.maxId));
    if (page.sinceId && isUuid(page.sinceId)) conditions.push(gt(statuses.id, page.sinceId));
    if (page.minId && isUuid(page.minId)) {
      // min_id: the page immediately after min_id, still returned newest first.
      conditions.push(gt(statuses.id, page.minId));
      const rows = await this.db
        .select()
        .from(statuses)
        .where(and(...conditions))
        .orderBy(asc(statuses.id))
        .limit(page.limit);
      return rows.reverse();
    }
    return this.db
      .select()
      .from(statuses)
      .where(and(...conditions))
      .orderBy(desc(statuses.id))
      .limit(page.limit);
  }

  /** Loads authors, boosted posts, counts and the viewer's state for a list of rows, in a fixed number of queries. */
  async hydrate(rows: StatusRow[], viewerId: string | null): Promise<StatusView[]> {
    if (!rows.length) return [];
    const reblogIds = rows.map((r) => r.reblogOfId).filter((id): id is string => !!id);
    const originals = reblogIds.length ? await this.db.select().from(statuses).where(inArray(statuses.id, reblogIds)) : [];
    const all = [...rows, ...originals];
    const ids = [...new Set(all.map((r) => r.id))];
    const accountIds = [...new Set(all.map((r) => r.accountId))];

    const [accountRows, replyCounts, reblogCounts, favCounts, myFavs, myReblogs] = await Promise.all([
      this.db.select().from(accounts).where(inArray(accounts.id, accountIds)),
      this.#countBy(statuses.inReplyToId, ids),
      this.#countBy(statuses.reblogOfId, ids),
      this.db
        .select({ id: favourites.statusId, n: count() })
        .from(favourites)
        .where(inArray(favourites.statusId, ids))
        .groupBy(favourites.statusId),
      viewerId
        ? this.db
            .select({ id: favourites.statusId })
            .from(favourites)
            .where(and(eq(favourites.accountId, viewerId), inArray(favourites.statusId, ids)))
        : [],
      viewerId
        ? this.db
            .select({ id: statuses.reblogOfId })
            .from(statuses)
            .where(and(eq(statuses.accountId, viewerId), inArray(statuses.reblogOfId, ids)))
        : [],
    ]);

    const byId = new Map(accountRows.map((a) => [a.id, a]));
    const tally = (list: { id: string | null; n: number }[]) => new Map(list.map((r) => [r.id!, r.n]));
    const replies = tally(replyCounts);
    const reblogs = tally(reblogCounts);
    const favs = tally(favCounts);
    const faved = new Set(myFavs.map((r) => r.id));
    const boosted = new Set(myReblogs.map((r) => r.id));
    const originalsById = new Map(originals.map((r) => [r.id, r]));

    const view = (row: StatusRow): StatusView => {
      const original = row.reblogOfId ? originalsById.get(row.reblogOfId) : undefined;
      return {
        status: row,
        account: byId.get(row.accountId)!,
        reblog: original ? view(original) : null,
        counts: { replies: replies.get(row.id) ?? 0, reblogs: reblogs.get(row.id) ?? 0, favourites: favs.get(row.id) ?? 0 },
        viewer: viewerId ? { favourited: faved.has(row.id), reblogged: boosted.has(row.id) } : null,
      };
    };
    return rows.map(view);
  }

  #countBy(column: typeof statuses.inReplyToId | typeof statuses.reblogOfId, ids: string[]) {
    return this.db
      .select({ id: column, n: count() })
      .from(statuses)
      .where(inArray(column, ids))
      .groupBy(column);
  }
}

export function canView(status: StatusRow, viewerId: string | null): boolean {
  // Followers-only and direct posts stay with their author until following
  // and mentions are delivered locally.
  return status.visibility === "public" || status.visibility === "unlisted" || status.accountId === viewerId;
}
