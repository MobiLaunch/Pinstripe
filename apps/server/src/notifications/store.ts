import { and, asc, count, desc, eq, gt, inArray, isNull, lt, notInArray, type SQL, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { accounts, markers, type NotificationType, notifications } from "../db/schema.ts";
import { uuidv7 } from "../ids.ts";
import type { Page } from "../statuses/store.ts";
import { isUuid } from "../store.ts";

export type NotificationRow = typeof notifications.$inferSelect;
export const NOTIFICATION_TYPES: readonly NotificationType[] = ["mention", "reblog", "favourite", "follow", "follow_request"];

/** The database, or a transaction on it. */
type Executor = Pick<Db, "execute" | "delete">;

/** Listeners told about each new notification (push delivery), by id. */
const created = new Set<(id: string) => void>();
export function onNotificationCreated(listener: (id: string) => void): () => void {
  created.add(listener);
  return () => created.delete(listener);
}

/**
 * Records that `from` did something to `to`. Nothing happens unless `to` is
 * a local account other than `from`; a repeat of the same thing is ignored.
 */
export async function notify(
  db: Executor,
  n: { to: string | null; from: string; type: NotificationType; statusId?: string | null },
): Promise<void> {
  if (!n.to || n.to === n.from) return;
  const id = uuidv7();
  const rows = await db.execute(sql`
    insert into ${notifications} (id, account_id, from_account_id, type, status_id)
    select ${id}, ${n.to}, ${n.from}, ${n.type}, ${n.statusId ?? null}
    where exists (select 1 from ${accounts} where ${accounts.id} = ${n.to} and ${accounts.domain} is null)
    on conflict do nothing
    returning id`);
  if (rows.length) for (const listener of created) listener(id);
}

/** Removes the notification for something undone (an unfollow, an unfavourite, an answered request). */
export async function unnotify(
  db: Executor,
  n: { to: string; from: string; type: NotificationType; statusId?: string | null },
): Promise<void> {
  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.accountId, n.to),
        eq(notifications.fromAccountId, n.from),
        eq(notifications.type, n.type),
        n.statusId ? eq(notifications.statusId, n.statusId) : isNull(notifications.statusId),
      ),
    );
}

export interface NotificationFilter {
  types?: NotificationType[];
  excludeTypes?: NotificationType[];
  /** Only from this account. */
  fromAccountId?: string;
  /** SQL over `notifications` for senders to leave out (blocked, muted). */
  hidden?: SQL;
}

export class NotificationStore {
  constructor(private readonly db: Db) {}

  #where(accountId: string, filter: NotificationFilter): SQL {
    return and(
      eq(notifications.accountId, accountId),
      filter.types?.length ? inArray(notifications.type, filter.types) : undefined,
      filter.excludeTypes?.length ? notInArray(notifications.type, filter.excludeTypes) : undefined,
      filter.fromAccountId ? eq(notifications.fromAccountId, filter.fromAccountId) : undefined,
      filter.hidden ? sql`not (${filter.hidden})` : undefined,
    )!;
  }

  /** Newest first, Mastodon-style paging on the (UUIDv7) id. */
  async list(accountId: string, page: Page, filter: NotificationFilter = {}): Promise<NotificationRow[]> {
    const conditions = [this.#where(accountId, filter)];
    if (page.maxId && isUuid(page.maxId)) conditions.push(lt(notifications.id, page.maxId));
    if (page.sinceId && isUuid(page.sinceId)) conditions.push(gt(notifications.id, page.sinceId));
    if (page.minId && isUuid(page.minId)) {
      conditions.push(gt(notifications.id, page.minId));
      const rows = await this.db
        .select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(asc(notifications.id))
        .limit(page.limit);
      return rows.reverse();
    }
    return this.db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.id))
      .limit(page.limit);
  }

  /** A notification as its recipient would see it (not hidden by blocks, mutes or limits). */
  async getShown(id: string, hidden: (accountId: string) => SQL): Promise<NotificationRow | null> {
    const [row] = await this.db.select().from(notifications).where(eq(notifications.id, id));
    if (!row) return null;
    const [shown] = await this.db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.id, id), sql`not (${hidden(row.accountId)})`));
    return shown ? row : null;
  }

  async get(accountId: string, id: string): Promise<NotificationRow | null> {
    if (!isUuid(id)) return null;
    const [row] = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.accountId, accountId)));
    return row ?? null;
  }

  async dismiss(accountId: string, id: string): Promise<boolean> {
    if (!isUuid(id)) return false;
    const rows = await this.db
      .delete(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.accountId, accountId)))
      .returning({ id: notifications.id });
    return rows.length > 0;
  }

  async clear(accountId: string): Promise<void> {
    await this.db.delete(notifications).where(eq(notifications.accountId, accountId));
  }

  /** Notifications newer than the read marker, counted up to `limit`. */
  async unreadCount(accountId: string, filter: NotificationFilter, limit: number): Promise<number> {
    const marker = await this.getMarker(accountId, "notifications");
    const after = marker && isUuid(marker.lastReadId) ? gt(notifications.id, marker.lastReadId) : undefined;
    const [row] = await this.db
      .select({ n: count() })
      .from(
        this.db
          .select({ id: notifications.id })
          .from(notifications)
          .where(and(this.#where(accountId, filter), after))
          .limit(limit)
          .as("unread"),
      );
    return row?.n ?? 0;
  }

  // Read markers

  async getMarker(accountId: string, timeline: "home" | "notifications") {
    const [row] = await this.db
      .select()
      .from(markers)
      .where(and(eq(markers.accountId, accountId), eq(markers.timeline, timeline)));
    return row ?? null;
  }

  /** Moves a marker; each save bumps `version`, as Mastodon does. */
  async setMarker(accountId: string, timeline: "home" | "notifications", lastReadId: string) {
    const [row] = await this.db
      .insert(markers)
      .values({ accountId, timeline, lastReadId })
      .onConflictDoUpdate({
        target: [markers.accountId, markers.timeline],
        set: { lastReadId, version: sql`${markers.version} + 1`, updatedAt: new Date() },
      })
      .returning();
    return row!;
  }
}
