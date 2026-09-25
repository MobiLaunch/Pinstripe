/**
 * Mastodon's status and timeline API:
 *
 *   POST   /api/v1/statuses                  post
 *   GET    /api/v1/statuses/:id
 *   DELETE /api/v1/statuses/:id              returns the post with `text`, for redrafting
 *   POST   /api/v1/statuses/:id/favourite    and /unfavourite
 *   POST   /api/v1/statuses/:id/reblog       and /unreblog
 *   GET    /api/v1/accounts/:id/statuses
 *   GET    /api/v1/timelines/home
 *   GET    /api/v1/timelines/public          ?local=true for Local
 *
 * Posts, deletes and boosts are also sent to the author's followers on
 * other servers.
 */
import type { Context as FedifyContext } from "@fedify/fedify";
import type { Activity } from "@fedify/vocab";
import { POST_MAX_LENGTH } from "@pinstripe/core";
import { type Context, Hono } from "hono";
import { type AuthEnv, requireUser } from "../auth/middleware.ts";
import type { ContextData } from "../federation.ts";
import { fromMastodonVisibility, type MastodonAccount, type MastodonStatus, serializeStatus } from "../mastodon.ts";
import type { LocalAccount, Store } from "../store.ts";
import { activityFor, buildAnnounce, buildDelete, buildUndoAnnounce, noteUri } from "./activitypub.ts";
import { renderContent } from "./content.ts";
import { canView, DEFAULT_LIMIT, MAX_LIMIT, type Page, type StatusRow, type StatusStore, type StatusView } from "./store.ts";

export interface StatusRoutesOptions {
  store: Store;
  statuses: StatusStore;
  domain: string;
  renderAccount: (c: Context, account: LocalAccount) => Promise<MastodonAccount>;
  federationContext: (c: Context) => FedifyContext<ContextData>;
}

async function readParams(c: Context): Promise<Record<string, string>> {
  const type = c.req.header("content-type") ?? "";
  if (type.includes("application/json")) {
    const body = await c.req.json().catch(() => ({}));
    return Object.fromEntries(
      Object.entries(body ?? {})
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, String(v)]),
    );
  }
  if (type.includes("form")) {
    const body = await c.req.parseBody();
    return Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]));
  }
  return {};
}

const truthy = (v: string | undefined) => v === "true" || v === "1" || v === "on";

function readPage(c: Context): Page {
  const limit = Number.parseInt(c.req.query("limit") ?? "", 10);
  return {
    maxId: c.req.query("max_id") || undefined,
    sinceId: c.req.query("since_id") || undefined,
    minId: c.req.query("min_id") || undefined,
    limit: Number.isFinite(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : DEFAULT_LIMIT,
  };
}

/** Mastodon clients page with the Link header: `rel="next"` is older, `rel="prev"` newer. */
function linkHeader(c: Context, rows: StatusRow[]): string | null {
  if (!rows.length) return null;
  const url = new URL(c.req.url);
  const at = (key: string, id: string) => {
    const u = new URL(url);
    for (const k of ["max_id", "since_id", "min_id"]) u.searchParams.delete(k);
    u.searchParams.set(key, id);
    return u.href;
  };
  return `<${at("max_id", rows.at(-1)!.id)}>; rel="next", <${at("min_id", rows[0]!.id)}>; rel="prev"`;
}

const notFound = (c: Context) => c.json({ error: "Record not found" }, 404);

export function statusRoutes({ store, statuses, domain, renderAccount, federationContext }: StatusRoutesOptions) {
  const app = new Hono<AuthEnv>();

  /** Serializes a page, rendering each author once. */
  async function serialize(c: Context, views: StatusView[]): Promise<MastodonStatus[]> {
    const ctx = federationContext(c);
    const accounts = new Map<string, Promise<MastodonAccount>>();
    const accountJson = (a: LocalAccount) => {
      if (!accounts.has(a.id)) accounts.set(a.id, renderAccount(c, a));
      return accounts.get(a.id)!;
    };
    const one = async (view: StatusView): Promise<MastodonStatus> => {
      const reblog = view.reblog ? await one(view.reblog) : null;
      const uri = noteUri(ctx, view.status);
      return serializeStatus(
        view,
        await accountJson(view.account),
        {
          uri: view.reblog ? `${uri.href}/activity` : uri.href,
          url: view.reblog ? null : new URL(`/@${view.account.username}/${view.status.id}`, ctx.canonicalOrigin).href,
          tagUrl: (tag) => new URL(`/tags/${encodeURIComponent(tag)}`, ctx.canonicalOrigin).href,
        },
        reblog,
      );
    };
    return Promise.all(views.map(one));
  }

  async function serializeOne(c: Context, row: StatusRow, viewerId: string | null) {
    const [view] = await statuses.hydrate([row], viewerId);
    return (await serialize(c, [view!]))[0]!;
  }

  /** Delivery to other servers never fails the request; it is queued and retried by Fedify. */
  async function deliver(c: Context, accountId: string, activity: Activity) {
    // Nobody to tell: skip it, which also skips signing (and generating keys).
    if (!(await store.hasAcceptedFollowers(accountId))) return;
    try {
      await federationContext(c).sendActivity({ identifier: accountId }, "followers", activity, { preferSharedInbox: true });
    } catch (error) {
      console.error("Failed to queue delivery", activity.id?.href, error);
    }
  }

  const viewerId = (c: Context<AuthEnv>) => c.get("token")?.account?.id ?? null;

  /** A status the viewer may see, or null. Boosts resolve to themselves, not their original. */
  async function visibleStatus(c: Context<AuthEnv>, id: string) {
    const status = await statuses.get(id);
    return status && canView(status, viewerId(c)) ? status : null;
  }

  app.post("/api/v1/statuses", async (c) => {
    const auth = requireUser(c, "write:statuses");
    if (!auth.ok) return auth.response;
    const { account } = auth.value;
    const p = await readParams(c);

    const text = (p.status ?? "").trim();
    if (!text) return c.json({ error: "Validation failed: Text can't be blank" }, 422);
    if ([...text].length > POST_MAX_LENGTH) {
      return c.json({ error: `Validation failed: Text character limit of ${POST_MAX_LENGTH} exceeded` }, 422);
    }
    const visibility = p.visibility ? fromMastodonVisibility(p.visibility) : account.settings.defaultVisibility;
    if (!visibility) return c.json({ error: "Validation failed: Visibility is invalid" }, 422);

    let parent: StatusRow | null = null;
    if (p.in_reply_to_id) {
      parent = await visibleStatus(c, p.in_reply_to_id);
      if (!parent || parent.reblogOfId) return c.json({ error: "Validation failed: Replied-to post not found" }, 422);
    }

    const origin = federationContext(c).canonicalOrigin;
    const rendered = await renderContent(text, {
      origin,
      domain,
      resolveLocal: async (username) => {
        const found = await store.getAccountByUsername(username);
        return found ? new URL(`/@${found.username}`, origin).href : null;
      },
    });
    const status = await statuses.create({
      accountId: account.id,
      text,
      content: rendered.html,
      tags: rendered.tags,
      visibility,
      inReplyToId: parent?.id ?? null,
      inReplyToAccountId: parent?.accountId ?? null,
      sensitive: truthy(p.sensitive) || !!p.spoiler_text,
      spoilerText: (p.spoiler_text ?? "").trim(),
      language: p.language || null,
    });

    const [view] = await statuses.hydrate([status], account.id);
    // Direct posts are only visible to their author until mentions are delivered.
    if (visibility !== "direct") await deliver(c, account.id, activityFor(federationContext(c), view!));
    return c.json((await serialize(c, [view!]))[0]!);
  });

  app.get("/api/v1/statuses/:id", async (c) => {
    const status = await visibleStatus(c, c.req.param("id"));
    return status ? c.json(await serializeOne(c, status, viewerId(c))) : notFound(c);
  });

  app.delete("/api/v1/statuses/:id", async (c) => {
    const auth = requireUser(c, "write:statuses");
    if (!auth.ok) return auth.response;
    const status = await statuses.get(c.req.param("id"));
    // Someone else's post is "not found", as in Mastodon.
    if (!status || status.accountId !== auth.value.account.id || status.reblogOfId) return notFound(c);
    const json = await serializeOne(c, status, auth.value.account.id);
    await statuses.delete(status.id);
    if (status.visibility !== "direct") await deliver(c, status.accountId, buildDelete(federationContext(c), status));
    return c.json({ ...json, text: status.text });
  });

  for (const action of ["favourite", "unfavourite"] as const) {
    app.post(`/api/v1/statuses/:id/${action}`, async (c) => {
      const auth = requireUser(c, "write:favourites");
      if (!auth.ok) return auth.response;
      const status = await visibleStatus(c, c.req.param("id"));
      if (!status) return notFound(c);
      // Favouriting a boost favourites the boosted post.
      const target = status.reblogOfId ? await statuses.get(status.reblogOfId) : status;
      if (!target) return notFound(c);
      const me = auth.value.account.id;
      if (action === "favourite") await statuses.favourite(me, target.id);
      else await statuses.unfavourite(me, target.id);
      // Likes of local posts need no delivery; remote posts come with inbound federation.
      return c.json(await serializeOne(c, target, me));
    });
  }

  app.post("/api/v1/statuses/:id/reblog", async (c) => {
    const auth = requireUser(c, "write:statuses");
    if (!auth.ok) return auth.response;
    const found = await visibleStatus(c, c.req.param("id"));
    const target = found?.reblogOfId ? await statuses.get(found.reblogOfId) : found;
    if (!target) return notFound(c);
    if (target.visibility !== "public" && target.visibility !== "unlisted") {
      return c.json({ error: "This action is not allowed" }, 422);
    }
    const p = await readParams(c);
    const visibility = fromMastodonVisibility(p.visibility) ?? "public";
    if (visibility === "direct") return c.json({ error: "Validation failed: Visibility is invalid" }, 422);
    const me = auth.value.account.id;
    const { row, created } = await statuses.reblog(me, target.id, visibility);
    const [view] = await statuses.hydrate([row], me);
    if (created) await deliver(c, me, activityFor(federationContext(c), view!));
    return c.json((await serialize(c, [view!]))[0]!);
  });

  app.post("/api/v1/statuses/:id/unreblog", async (c) => {
    const auth = requireUser(c, "write:statuses");
    if (!auth.ok) return auth.response;
    const found = await visibleStatus(c, c.req.param("id"));
    const target = found?.reblogOfId ? await statuses.get(found.reblogOfId) : found;
    if (!target) return notFound(c);
    const me = auth.value.account.id;
    const existing = await statuses.findReblog(me, target.id);
    if (existing) {
      await statuses.unreblog(me, target.id);
      const ctx = federationContext(c);
      const announce = buildAnnounce(ctx, existing, noteUri(ctx, target), ctx.getActorUri(target.accountId));
      await deliver(c, me, buildUndoAnnounce(ctx, announce, existing));
    }
    return c.json(await serializeOne(c, target, me));
  });

  app.get("/api/v1/accounts/:id/statuses", async (c) => {
    const account = await store.getAccount(c.req.param("id"));
    if (!account) return notFound(c);
    const rows = await statuses.accountStatuses(account.id, readPage(c), {
      viewerId: viewerId(c),
      excludeReblogs: truthy(c.req.query("exclude_reblogs")),
    });
    // Media-only filtering needs media; until then nothing matches.
    const filtered = truthy(c.req.query("only_media")) ? [] : rows;
    return respondWithPage(c, filtered);
  });

  app.get("/api/v1/timelines/home", async (c) => {
    const auth = requireUser(c, "read:statuses");
    if (!auth.ok) return auth.response;
    return respondWithPage(c, await statuses.homeTimeline(auth.value.account.id, readPage(c)));
  });

  app.get("/api/v1/timelines/public", async (c) => {
    // Every stored post is local until inbound federation lands, so remote=true is empty.
    if (truthy(c.req.query("remote"))) return c.json([]);
    return respondWithPage(c, await statuses.publicTimeline(readPage(c)));
  });

  async function respondWithPage(c: Context<AuthEnv>, rows: StatusRow[]) {
    const link = linkHeader(c, rows);
    if (link) c.header("Link", link);
    return c.json(await serialize(c, await statuses.hydrate(rows, viewerId(c))));
  }

  return app;
}
