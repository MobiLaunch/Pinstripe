/**
 * Mastodon's notifications and read-marker API:
 *
 *   GET  /api/v1/notifications                 ?types[]= &exclude_types[]= &account_id=, paged
 *   GET  /api/v1/notifications/unread_count    newer than the notifications marker
 *   GET  /api/v1/notifications/:id
 *   POST /api/v1/notifications/:id/dismiss
 *   POST /api/v1/notifications/clear
 *   GET  /api/v1/markers                       ?timeline[]=notifications&timeline[]=home
 *   POST /api/v1/markers                       { notifications: { last_read_id } }
 */
import type { SQL } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { type AuthEnv, requireUser } from "../auth/middleware.ts";
import type { NotificationType } from "../db/schema.ts";
import { notFound, readLimit, setLinkHeader } from "../http.ts";
import type { MastodonAccount, MastodonStatus } from "../mastodon.ts";
import type { StatusRenderer } from "../statuses/render.ts";
import { DEFAULT_LIMIT, type StatusStore } from "../statuses/store.ts";
import type { AccountRow, Store } from "../store.ts";
import { NOTIFICATION_TYPES, type NotificationFilter, type NotificationRow, type NotificationStore } from "./store.ts";

const MAX_LIMIT = 80;
const TIMELINES = ["home", "notifications"] as const;

export interface NotificationRoutesOptions {
  store: Store;
  statuses: StatusStore;
  notifications: NotificationStore;
  render: StatusRenderer;
  renderAccount: (c: Context, account: AccountRow) => Promise<MastodonAccount>;
  /** Senders to leave out for this viewer (blocked, muted), as SQL over `notifications`. */
  hiddenFor?: (accountId: string) => SQL;
}

export interface MastodonNotification {
  id: string;
  type: NotificationType;
  created_at: string;
  account: MastodonAccount;
  status?: MastodonStatus;
}

function readTypes(c: Context, key: string): NotificationType[] | undefined {
  const values = [...(c.req.queries(`${key}[]`) ?? []), ...(c.req.queries(key) ?? [])];
  const known = values.filter((v): v is NotificationType => (NOTIFICATION_TYPES as readonly string[]).includes(v));
  return values.length ? known : undefined;
}

export function notificationRoutes({ store, statuses, notifications, render, renderAccount, hiddenFor }: NotificationRoutesOptions) {
  const app = new Hono<AuthEnv>();

  function filterFor(c: Context, accountId: string): NotificationFilter {
    return {
      types: readTypes(c, "types"),
      excludeTypes: readTypes(c, "exclude_types"),
      fromAccountId: c.req.query("account_id") || undefined,
      hidden: hiddenFor?.(accountId),
    };
  }

  /** Rows → Mastodon JSON. Ones whose post is gone or no longer visible are left out. */
  async function serialize(c: Context, viewerId: string, rows: NotificationRow[]): Promise<MastodonNotification[]> {
    const [senders, statusRows] = await Promise.all([
      store.getAccounts([...new Set(rows.map((r) => r.fromAccountId))]),
      Promise.all(rows.map((r) => (r.statusId ? statuses.get(r.statusId) : null))),
    ]);
    // A boost notification shows the post that was boosted, as on Mastodon.
    const shown = await Promise.all(
      statusRows.map(async (s) => (s?.reblogOfId ? statuses.getVisible(s.reblogOfId, viewerId) : s ? statuses.getVisible(s.id, viewerId) : null)),
    );
    const present = shown.filter((s) => s !== null);
    const rendered = new Map((await render.rows(c, present, viewerId)).map((json, i) => [present[i]!.id, json]));
    const byId = new Map(senders.map((a) => [a.id, a]));
    const accountJson = new Map<string, Promise<MastodonAccount>>();

    const out: MastodonNotification[] = [];
    for (const [i, row] of rows.entries()) {
      const sender = byId.get(row.fromAccountId);
      const status = shown[i] ? rendered.get(shown[i]!.id) : undefined;
      if (!sender || (row.statusId && !status)) continue;
      if (!accountJson.has(sender.id)) accountJson.set(sender.id, renderAccount(c, sender));
      out.push({
        id: row.id,
        type: row.type,
        created_at: row.createdAt.toISOString(),
        account: await accountJson.get(sender.id)!,
        ...(status ? { status } : {}),
      });
    }
    return out;
  }

  app.get("/api/v1/notifications", async (c) => {
    const auth = requireUser(c, "read:notifications");
    if (!auth.ok) return auth.response;
    const { account } = auth.value;
    const rows = await notifications.list(
      account.id,
      {
        maxId: c.req.query("max_id") || undefined,
        sinceId: c.req.query("since_id") || undefined,
        minId: c.req.query("min_id") || undefined,
        limit: readLimit(c, DEFAULT_LIMIT * 2, MAX_LIMIT),
      },
      filterFor(c, account.id),
    );
    // Paging follows the rows fetched, even when some are left out of the JSON.
    setLinkHeader(c, rows.map((r) => r.id));
    return c.json(await serialize(c, account.id, rows));
  });

  app.get("/api/v1/notifications/unread_count", async (c) => {
    const auth = requireUser(c, "read:notifications");
    if (!auth.ok) return auth.response;
    const limit = readLimit(c, 100, 1000);
    return c.json({ count: await notifications.unreadCount(auth.value.account.id, filterFor(c, auth.value.account.id), limit) });
  });

  app.post("/api/v1/notifications/clear", async (c) => {
    const auth = requireUser(c, "write:notifications");
    if (!auth.ok) return auth.response;
    await notifications.clear(auth.value.account.id);
    return c.json({});
  });

  app.get("/api/v1/notifications/:id", async (c) => {
    const auth = requireUser(c, "read:notifications");
    if (!auth.ok) return auth.response;
    const row = await notifications.get(auth.value.account.id, c.req.param("id"));
    const [json] = row ? await serialize(c, auth.value.account.id, [row]) : [];
    return json ? c.json(json) : notFound(c);
  });

  app.post("/api/v1/notifications/:id/dismiss", async (c) => {
    const auth = requireUser(c, "write:notifications");
    if (!auth.ok) return auth.response;
    return (await notifications.dismiss(auth.value.account.id, c.req.param("id"))) ? c.json({}) : notFound(c);
  });

  const markerJson = (m: { lastReadId: string; version: number; updatedAt: Date }) => ({
    last_read_id: m.lastReadId,
    version: m.version,
    updated_at: m.updatedAt.toISOString(),
  });

  app.get("/api/v1/markers", async (c) => {
    const auth = requireUser(c, "read:statuses");
    if (!auth.ok) return auth.response;
    const wanted = [...(c.req.queries("timeline[]") ?? []), ...(c.req.queries("timeline") ?? [])];
    const out: Record<string, ReturnType<typeof markerJson>> = {};
    for (const timeline of TIMELINES) {
      if (!wanted.includes(timeline)) continue;
      const marker = await notifications.getMarker(auth.value.account.id, timeline);
      if (marker) out[timeline] = markerJson(marker);
    }
    return c.json(out);
  });

  app.post("/api/v1/markers", async (c) => {
    const auth = requireUser(c, "write:statuses");
    if (!auth.ok) return auth.response;
    // JSON `{ notifications: { last_read_id } }` or form `notifications[last_read_id]=`.
    const type = c.req.header("content-type") ?? "";
    const body: Record<string, unknown> = type.includes("application/json")
      ? ((await c.req.json().catch(() => ({}))) ?? {})
      : await c.req.parseBody().catch(() => ({}));
    const out: Record<string, ReturnType<typeof markerJson>> = {};
    for (const timeline of TIMELINES) {
      const nested = body[timeline] as { last_read_id?: unknown } | undefined;
      const id = nested?.last_read_id ?? body[`${timeline}[last_read_id]`];
      if (typeof id !== "string" || !id) continue;
      out[timeline] = markerJson(await notifications.setMarker(auth.value.account.id, timeline, id));
    }
    return c.json(out);
  });

  return app;
}
