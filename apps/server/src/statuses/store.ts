import type { Visibility } from "@pinstripe/core";
import { and, asc, count, desc, eq, gt, inArray, isNull, lt, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { accounts, blocks, favourites, follows, mediaAttachments, mentions, statuses } from "../db/schema.ts";
import type { MediaRow } from "../media/store.ts";
import { uuidv7 } from "../ids.ts";
import { notify, unnotify } from "../notifications/store.ts";
import { authorSuspended, blocksViewer, hiddenStatus } from "../safety/sql.ts";
import { type AccountRow, isUniqueViolation, isUuid } from "../store.ts";

export type StatusRow = typeof statuses.$inferSelect;

/** A status with everything needed to show it. */
export interface StatusView {
  status: StatusRow;
  account: AccountRow;
  /** For boosts: the boosted status. */
  reblog: StatusView | null;
  mentions: AccountRow[];
  /** Attachments, in order. */
  media: MediaRow[];
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

export interface NewStatus {
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
  mentionIds: string[];
  /** Uploads to attach, in order. They must be the author's, ready and not yet attached. */
  mediaIds?: string[];
}

/**
 * Who may see a status, as SQL over `statuses`: public and unlisted posts
 * are open; the author sees everything; accepted followers see
 * followers-only posts; mentioned accounts see the post whatever its
 * visibility. Nobody sees a suspended account's posts, and nobody sees the
 * posts of someone who blocked them.
 */
export function visibleTo(viewerId: string | null): SQL {
  const open = inArray(statuses.visibility, ["public", "unlisted"]);
  // Suspended accounts' posts are gone for everyone; someone who blocked you is gone for you.
  const allowed = viewerId
    ? sql`not ${authorSuspended(statuses.accountId)} and not ${blocksViewer(statuses.accountId, viewerId)}`
    : sql`not ${authorSuspended(statuses.accountId)}`;
  return sql`(${allowed} and ${audience(open, viewerId)})`;
}

function audience(open: SQL, viewerId: string | null): SQL {
  if (!viewerId) return open;
  return sql`(${open}
    or ${statuses.accountId} = ${viewerId}
    or (${statuses.visibility} = 'followers' and exists (
      select 1 from ${follows} where ${follows.followerId} = ${viewerId}
        and ${follows.followingId} = ${statuses.accountId} and ${follows.state} = 'accepted'))
    or exists (select 1 from ${mentions} where ${mentions.statusId} = ${statuses.id} and ${mentions.accountId} = ${viewerId}))`;
}

/** An attachment on a post from another server. */
export interface RemoteMedia {
  type: "image" | "video";
  url: string;
  previewUrl: string | null;
  contentType: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  description: string;
  blurhash: string | null;
}

/** "any": posts with photos or videos; "video": posts whose first attachment is a video (the Videos tab). */
export type MediaFilter = "any" | "video";

function hasMedia(filter: MediaFilter, options: { throughBoosts?: boolean } = {}): SQL {
  const target = options.throughBoosts ? sql`coalesce(${statuses.reblogOfId}, ${statuses.id})` : sql`${statuses.id}`;
  return filter === "video"
    ? sql`exists (select 1 from ${mediaAttachments} m where m.status_id = ${target} and m.position = 0 and m.type = 'video' and m.state = 'ready')`
    : sql`exists (select 1 from ${mediaAttachments} m where m.status_id = ${target} and m.state = 'ready')`;
}

const followedBy = (viewerId: string) =>
  sql`${statuses.accountId} in (select ${follows.followingId} from ${follows} where ${follows.followerId} = ${viewerId} and ${follows.state} = 'accepted')`;

/**
 * Everyone mentioned hears about a post, and so does the author of the post
 * it replies to (clients usually mention them too, but needn't).
 */
async function notifyMentioned(db: Parameters<typeof notify>[0], status: StatusRow, mentionIds: string[]) {
  const recipients = new Set(mentionIds);
  if (status.inReplyToAccountId) recipients.add(status.inReplyToAccountId);
  for (const to of recipients) await notify(db, { to, from: status.accountId, type: "mention", statusId: status.id });
}

export class StatusStore {
  constructor(private readonly db: Db) {}

  async create({ mentionIds, mediaIds = [], ...input }: NewStatus): Promise<StatusRow> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(statuses)
        .values({ id: uuidv7(), ...input })
        .returning();
      for (const [position, id] of mediaIds.entries()) {
        await tx
          .update(mediaAttachments)
          .set({ statusId: row!.id, position })
          .where(and(eq(mediaAttachments.id, id), eq(mediaAttachments.accountId, input.accountId), isNull(mediaAttachments.statusId)));
      }
      if (mentionIds.length) {
        await tx
          .insert(mentions)
          .values([...new Set(mentionIds)].map((accountId) => ({ statusId: row!.id, accountId })))
          .onConflictDoNothing();
      }
      await notifyMentioned(tx, row!, mentionIds);
      return row!;
    });
  }

  /**
   * Stores a post from another server, or updates it if we already have it.
   * Its id is derived from when it was published (never later than now), so
   * timelines order it by time.
   */
  async upsertRemote(
    input: NewStatus & { uri: string; url: string | null; publishedAt: Date; remoteMedia?: RemoteMedia[] },
  ): Promise<StatusRow> {
    const { mentionIds, publishedAt, remoteMedia = [], mediaIds: _unused, ...values } = input;
    const createdAt = new Date(Math.min(publishedAt.getTime(), Date.now()));
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(statuses)
        .values({ id: uuidv7(createdAt.getTime()), createdAt, ...values })
        .onConflictDoUpdate({
          target: statuses.uri,
          // Only the text can change on edit; who wrote it and where it sits in a thread can't.
          set: { content: values.content, spoilerText: values.spoilerText, sensitive: values.sensitive, tags: values.tags },
        })
        .returning();
      await tx.delete(mentions).where(eq(mentions.statusId, row!.id));
      if (mentionIds.length) {
        await tx.insert(mentions).values([...new Set(mentionIds)].map((accountId) => ({ statusId: row!.id, accountId })));
      }
      await notifyMentioned(tx, row!, mentionIds);
      // Remote attachments are links to the other server's files; replace them on edit.
      await tx.delete(mediaAttachments).where(eq(mediaAttachments.statusId, row!.id));
      if (remoteMedia.length) {
        await tx.insert(mediaAttachments).values(
          remoteMedia.map((m, position) => ({
            id: uuidv7(),
            accountId: values.accountId,
            statusId: row!.id,
            position,
            type: m.type,
            state: "ready" as const,
            contentType: m.contentType,
            remoteUrl: m.url,
            remotePreviewUrl: m.previewUrl,
            meta: { width: m.width, height: m.height, duration: m.duration, size: null },
            description: m.description,
            blurhash: m.blurhash,
          })),
        );
      }
      return row!;
    });
  }

  async get(id: string): Promise<StatusRow | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.db.select().from(statuses).where(eq(statuses.id, id));
    return row ?? null;
  }

  async getByUri(uri: string): Promise<StatusRow | null> {
    const [row] = await this.db.select().from(statuses).where(eq(statuses.uri, uri));
    return row ?? null;
  }

  /** The status if the viewer may see it. */
  async getVisible(id: string, viewerId: string | null): Promise<StatusRow | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.db
      .select()
      .from(statuses)
      .where(and(eq(statuses.id, id), visibleTo(viewerId)));
    return row ?? null;
  }

  /** Deletes a status and, through cascades, its boosts, favourites and mentions. */
  async delete(id: string): Promise<void> {
    await this.db.delete(statuses).where(eq(statuses.id, id));
  }

  async mentionedAccounts(statusId: string): Promise<AccountRow[]> {
    const rows = await this.db
      .select({ account: accounts })
      .from(mentions)
      .innerJoin(accounts, eq(mentions.accountId, accounts.id))
      .where(eq(mentions.statusId, statusId));
    return rows.map((r) => r.account);
  }

  /** The account's boost of a status, if any. */
  async findReblog(accountId: string, statusId: string): Promise<StatusRow | null> {
    const [row] = await this.db
      .select()
      .from(statuses)
      .where(and(eq(statuses.accountId, accountId), eq(statuses.reblogOfId, statusId)));
    return row ?? null;
  }

  /** Boosting twice returns the existing boost. `remote` is set for boosts from other servers. */
  async reblog(
    accountId: string,
    statusId: string,
    visibility: Visibility,
    remote?: { uri: string; publishedAt: Date },
  ): Promise<{ row: StatusRow; created: boolean }> {
    const existing = await this.findReblog(accountId, statusId);
    if (existing) return { row: existing, created: false };
    try {
      const createdAt = remote ? new Date(Math.min(remote.publishedAt.getTime(), Date.now())) : new Date();
      const [row] = await this.db
        .insert(statuses)
        .values({ id: uuidv7(createdAt.getTime()), createdAt, accountId, reblogOfId: statusId, visibility, uri: remote?.uri ?? null })
        .returning();
      await notify(this.db, { to: await this.#authorOf(statusId), from: accountId, type: "reblog", statusId: row!.id });
      return { row: row!, created: true };
    } catch (error) {
      // Two taps racing, or an Announce delivered twice: the other one won.
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
    await notify(this.db, { to: await this.#authorOf(statusId), from: accountId, type: "favourite", statusId });
  }

  async unfavourite(accountId: string, statusId: string) {
    await this.db.delete(favourites).where(and(eq(favourites.accountId, accountId), eq(favourites.statusId, statusId)));
    const author = await this.#authorOf(statusId);
    if (author) await unnotify(this.db, { to: author, from: accountId, type: "favourite", statusId });
  }

  async #authorOf(statusId: string): Promise<string | null> {
    const [row] = await this.db.select({ accountId: statuses.accountId }).from(statuses).where(eq(statuses.id, statusId));
    return row?.accountId ?? null;
  }

  /** Local posts (not boosts), for NodeInfo. */
  async countLocal(): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(statuses)
      .where(and(isNull(statuses.reblogOfId), isNull(statuses.uri)));
    return row?.n ?? 0;
  }

  async countByAccount(accountId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: count() })
      .from(statuses)
      .where(and(eq(statuses.accountId, accountId), isNull(statuses.reblogOfId)));
    return row?.n ?? 0;
  }

  /** A profile's posts and boosts, as far as the viewer may see them. */
  accountStatuses(
    accountId: string,
    page: Page,
    options: { viewerId: string | null; excludeReblogs?: boolean; excludeReplies?: boolean; media?: MediaFilter },
  ) {
    return this.#page(
      and(
        eq(statuses.accountId, accountId),
        options.media ? hasMedia(options.media) : undefined,
        visibleTo(options.viewerId),
        // A profile you blocked shows no posts (as on Mastodon); muted ones still do.
        options.viewerId ? sql`not exists (select 1 from ${blocks} where ${blocks.accountId} = ${options.viewerId} and ${blocks.targetAccountId} = ${statuses.accountId})` : undefined,
        options.excludeReblogs ? isNull(statuses.reblogOfId) : undefined,
        options.excludeReplies ? isNull(statuses.inReplyToId) : undefined,
      )!,
      page,
    );
  }

  /** Public posts, no boosts (as in Mastodon). `scope` picks Local (this server), remote only, or everything (Federated). */
  publicTimeline(page: Page, scope: "local" | "remote" | "all", media?: MediaFilter, viewerId: string | null = null) {
    const where: SQL[] = [eq(statuses.visibility, "public"), isNull(statuses.reblogOfId), visibleTo(viewerId)];
    const hidden = hiddenStatus(viewerId);
    if (hidden) where.push(sql`not ${hidden}`);
    if (media) where.push(hasMedia(media));
    if (scope !== "all") {
      where.push(
        sql`${statuses.accountId} in (select ${accounts.id} from ${accounts} where ${accounts.domain} ${scope === "local" ? sql`is null` : sql`is not null`})`,
      );
    }
    return this.#page(and(...where)!, page);
  }

  /**
   * Home: your posts and boosts, and those of everyone you follow, that you
   * may see. With `media`, only posts (or boosts of posts) with photos/videos.
   */
  homeTimeline(accountId: string, page: Page, media?: MediaFilter) {
    return this.#page(
      and(
        sql`(${statuses.accountId} = ${accountId} or ${followedBy(accountId)})`,
        visibleTo(accountId),
        sql`not ${hiddenStatus(accountId)!}`,
        media ? hasMedia(media, { throughBoosts: true }) : undefined,
      )!,
      page,
    );
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

  /** A thread around a status: the posts it replies to (oldest first) and the replies under it, as far as the viewer may see. */
  async context(status: StatusRow, viewerId: string | null): Promise<{ ancestors: StatusRow[]; descendants: StatusRow[] }> {
    const ancestors: StatusRow[] = [];
    let parentId = status.inReplyToId;
    // Threads can be long, but not unboundedly: stop after 40 hops.
    while (parentId && ancestors.length < 40) {
      const parent = await this.getVisible(parentId, viewerId);
      if (!parent) break;
      ancestors.unshift(parent);
      parentId = parent.inReplyToId;
    }
    const descendants = await this.db
      .select()
      .from(statuses)
      .where(
        and(
          sql`${statuses.id} in (
            with recursive thread(id, depth) as (
              select ${statuses.id}, 1 from ${statuses} where ${statuses.inReplyToId} = ${status.id}
              union all
              select s.id, thread.depth + 1 from ${statuses} s join thread on s.in_reply_to_id = thread.id where thread.depth < 40
            ) select id from thread)`,
          visibleTo(viewerId),
          viewerId ? sql`not ${hiddenStatus(viewerId)!}` : undefined,
        ),
      )
      .orderBy(asc(statuses.id))
      .limit(200);
    return { ancestors, descendants };
  }

  /** Loads authors, boosted posts, mentions, counts and the viewer's state for a list of rows, in a fixed number of queries. */
  async hydrate(rows: StatusRow[], viewerId: string | null): Promise<StatusView[]> {
    if (!rows.length) return [];
    const reblogIds = rows.map((r) => r.reblogOfId).filter((id): id is string => !!id);
    const originals = reblogIds.length ? await this.db.select().from(statuses).where(inArray(statuses.id, reblogIds)) : [];
    const all = [...rows, ...originals];
    const ids = [...new Set(all.map((r) => r.id))];

    const [mediaRows, mentionRows, replyCounts, reblogCounts, favCounts, myFavs, myReblogs] = await Promise.all([
      this.db
        .select()
        .from(mediaAttachments)
        .where(and(inArray(mediaAttachments.statusId, ids), eq(mediaAttachments.state, "ready")))
        .orderBy(asc(mediaAttachments.position)),
      this.db
        .select({ statusId: mentions.statusId, accountId: mentions.accountId })
        .from(mentions)
        .where(inArray(mentions.statusId, ids)),
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

    const accountIds = [...new Set([...all.map((r) => r.accountId), ...mentionRows.map((m) => m.accountId)])];
    const accountRows = await this.db.select().from(accounts).where(inArray(accounts.id, accountIds));
    const byId = new Map(accountRows.map((a) => [a.id, a]));
    const tally = (list: { id: string | null; n: number }[]) => new Map(list.map((r) => [r.id!, r.n]));
    const replies = tally(replyCounts);
    const reblogs = tally(reblogCounts);
    const favs = tally(favCounts);
    const faved = new Set(myFavs.map((r) => r.id));
    const boosted = new Set(myReblogs.map((r) => r.id));
    const originalsById = new Map(originals.map((r) => [r.id, r]));
    const mediaOf = new Map<string, MediaRow[]>();
    for (const m of mediaRows) mediaOf.set(m.statusId!, [...(mediaOf.get(m.statusId!) ?? []), m]);
    const mentionsOf = new Map<string, AccountRow[]>();
    for (const m of mentionRows) {
      const account = byId.get(m.accountId);
      if (account) mentionsOf.set(m.statusId, [...(mentionsOf.get(m.statusId) ?? []), account]);
    }

    const view = (row: StatusRow): StatusView => {
      const original = row.reblogOfId ? originalsById.get(row.reblogOfId) : undefined;
      return {
        status: row,
        account: byId.get(row.accountId)!,
        reblog: original ? view(original) : null,
        mentions: mentionsOf.get(row.id) ?? [],
        media: mediaOf.get(row.id) ?? [],
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
