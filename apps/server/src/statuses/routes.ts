/**
 * Mastodon's status and timeline API:
 *
 *   POST   /api/v1/statuses                  post (and reply)
 *   GET    /api/v1/statuses/:id
 *   GET    /api/v1/statuses/:id/context      the thread around a post
 *   DELETE /api/v1/statuses/:id              returns the post with `text`, for redrafting
 *   POST   /api/v1/statuses/:id/favourite    and /unfavourite
 *   POST   /api/v1/statuses/:id/reblog       and /unreblog
 *   GET    /api/v1/accounts/:id/statuses
 *   GET    /api/v1/timelines/home
 *   GET    /api/v1/timelines/public          ?local=true for Local, ?remote=true for other servers only
 *
 * Posts, deletes, boosts and favourites are also sent to the servers that
 * need to know: the author's remote followers, anyone mentioned, and the
 * author of the post being replied to, boosted or favourited.
 */
import type { Context as FedifyContext } from "@fedify/fedify";
import { POST_MAX_LENGTH } from "@pinstripe/core";
import { type Context, Hono } from "hono";
import { type AuthEnv, requireUser } from "../auth/middleware.ts";
import type { ContextData } from "../federation.ts";
import { notFound, readLimit, readParams, setLinkHeader, truthy } from "../http.ts";
import { fromMastodonVisibility } from "../mastodon.ts";
import { resolveHandle } from "../remote/actors.ts";
import { deliver } from "../remote/deliver.ts";
import { type AccountRow, isLocal, type Store } from "../store.ts";
import { activityFor, buildAnnounce, buildDelete, buildLike, buildUndo, noteUri } from "./activitypub.ts";
import { renderContent } from "./content.ts";
import type { StatusRenderer } from "./render.ts";
import { DEFAULT_LIMIT, MAX_LIMIT, type Page, type StatusRow, type StatusStore, type StatusView } from "./store.ts";

export interface StatusRoutesOptions {
  store: Store;
  statuses: StatusStore;
  domain: string;
  render: StatusRenderer;
  federationContext: (c: Context) => FedifyContext<ContextData>;
}

function readPage(c: Context): Page {
  return {
    maxId: c.req.query("max_id") || undefined,
    sinceId: c.req.query("since_id") || undefined,
    minId: c.req.query("min_id") || undefined,
    limit: readLimit(c, DEFAULT_LIMIT, MAX_LIMIT),
  };
}

export function statusRoutes({ store, statuses, domain, render, federationContext }: StatusRoutesOptions) {
  const app = new Hono<AuthEnv>();
  const viewerId = (c: Context<AuthEnv>) => c.get("token")?.account?.id ?? null;

  async function one(c: Context<AuthEnv>, row: StatusRow) {
    return (await render.rows(c, [row], viewerId(c)))[0]!;
  }

  /** Who hears about a local post: its followers (unless direct), everyone mentioned, and the replied-to author. */
  async function audienceOf(view: StatusView): Promise<{ followers: boolean; to: (AccountRow | null)[] }> {
    const parentAuthor = view.status.inReplyToAccountId ? await store.getAccount(view.status.inReplyToAccountId) : null;
    return { followers: view.status.visibility !== "direct", to: [...view.mentions, parentAuthor] };
  }

  /** A boost's original, or the status itself. */
  async function target(c: Context<AuthEnv>, id: string) {
    const found = await statuses.getVisible(id, viewerId(c));
    const original = found?.reblogOfId ? await statuses.getVisible(found.reblogOfId, viewerId(c)) : found;
    return original ?? null;
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
      parent = await statuses.getVisible(p.in_reply_to_id, account.id);
      if (!parent || parent.reblogOfId) return c.json({ error: "Validation failed: Replied-to post not found" }, 422);
    }

    const ctx = federationContext(c);
    const rendered = await renderContent(text, {
      origin: ctx.canonicalOrigin,
      domain,
      resolveMention: async (username, host) => {
        const found = host ? await resolveHandle(ctx, username, host, { resolve: true }) : await store.getAccountByUsername(username);
        if (!found) return null;
        const href = isLocal(found) ? new URL(`/@${found.username}`, ctx.canonicalOrigin).href : (found.url ?? found.uri!);
        return { href, accountId: found.id };
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
      mentionIds: rendered.mentions.map((m) => m.accountId).filter((id) => id !== account.id),
    });

    const [view] = await statuses.hydrate([status], account.id);
    const replyTarget = parent ? noteUri(ctx, parent) : null;
    await deliver(ctx, account.id, activityFor(ctx, view!, replyTarget), await audienceOf(view!));
    return c.json((await render.views(c, [view!]))[0]!);
  });

  app.get("/api/v1/statuses/:id", async (c) => {
    const status = await statuses.getVisible(c.req.param("id"), viewerId(c));
    return status ? c.json(await one(c, status)) : notFound(c);
  });

  app.get("/api/v1/statuses/:id/context", async (c) => {
    const status = await statuses.getVisible(c.req.param("id"), viewerId(c));
    if (!status) return notFound(c);
    const { ancestors, descendants } = await statuses.context(status, viewerId(c));
    return c.json({
      ancestors: await render.rows(c, ancestors, viewerId(c)),
      descendants: await render.rows(c, descendants, viewerId(c)),
    });
  });

  app.delete("/api/v1/statuses/:id", async (c) => {
    const auth = requireUser(c, "write:statuses");
    if (!auth.ok) return auth.response;
    const status = await statuses.get(c.req.param("id"));
    // Someone else's post is "not found", as in Mastodon.
    if (!status || status.accountId !== auth.value.account.id || status.reblogOfId) return notFound(c);
    const [view] = await statuses.hydrate([status], auth.value.account.id);
    const json = (await render.views(c, [view!]))[0]!;
    const audience = await audienceOf(view!);
    await statuses.delete(status.id);
    const ctx = federationContext(c);
    await deliver(ctx, status.accountId, buildDelete(ctx, view!), audience);
    return c.json({ ...json, text: status.text });
  });

  for (const action of ["favourite", "unfavourite"] as const) {
    app.post(`/api/v1/statuses/:id/${action}`, async (c) => {
      const auth = requireUser(c, "write:favourites");
      if (!auth.ok) return auth.response;
      // Favouriting a boost favourites the boosted post.
      const status = await target(c, c.req.param("id"));
      if (!status) return notFound(c);
      const me = auth.value.account.id;
      const already = (await statuses.hydrate([status], me))[0]!.viewer!.favourited;
      if (action === "favourite") await statuses.favourite(me, status.id);
      else await statuses.unfavourite(me, status.id);

      // Remote authors hear about it; their server keeps their counts.
      const author = await store.getAccount(status.accountId);
      if (author && !isLocal(author) && already !== (action === "favourite")) {
        const ctx = federationContext(c);
        const like = buildLike(ctx, me, status);
        await deliver(ctx, me, action === "favourite" ? like : buildUndo(ctx, me, like), { to: [author] });
      }
      return c.json(await one(c, status));
    });
  }

  app.post("/api/v1/statuses/:id/reblog", async (c) => {
    const auth = requireUser(c, "write:statuses");
    if (!auth.ok) return auth.response;
    const original = await target(c, c.req.param("id"));
    if (!original) return notFound(c);
    if (original.visibility !== "public" && original.visibility !== "unlisted") {
      return c.json({ error: "This action is not allowed" }, 422);
    }
    const p = await readParams(c);
    const visibility = fromMastodonVisibility(p.visibility) ?? "public";
    if (visibility === "direct") return c.json({ error: "Validation failed: Visibility is invalid" }, 422);
    const me = auth.value.account.id;
    const { row, created } = await statuses.reblog(me, original.id, visibility);
    const [view] = await statuses.hydrate([row], me);
    if (created) {
      const ctx = federationContext(c);
      await deliver(ctx, me, activityFor(ctx, view!, null), { followers: true, to: [view!.reblog!.account] });
    }
    return c.json((await render.views(c, [view!]))[0]!);
  });

  app.post("/api/v1/statuses/:id/unreblog", async (c) => {
    const auth = requireUser(c, "write:statuses");
    if (!auth.ok) return auth.response;
    const original = await target(c, c.req.param("id"));
    if (!original) return notFound(c);
    const me = auth.value.account.id;
    const existing = await statuses.unreblog(me, original.id);
    if (existing) {
      const ctx = federationContext(c);
      const author = await store.getAccount(original.accountId);
      const announce = buildAnnounce(ctx, existing, noteUri(ctx, original), new URL(author?.uri ?? ctx.getActorUri(original.accountId)));
      await deliver(ctx, me, buildUndo(ctx, me, announce), { followers: true, to: [author] });
    }
    return c.json(await one(c, original));
  });

  app.get("/api/v1/accounts/:id/statuses", async (c) => {
    const account = await store.getAccount(c.req.param("id"));
    if (!account) return notFound(c);
    // Media-only filtering needs media; until then nothing matches.
    if (truthy(c.req.query("only_media"))) return c.json([]);
    const rows = await statuses.accountStatuses(account.id, readPage(c), {
      viewerId: viewerId(c),
      excludeReblogs: truthy(c.req.query("exclude_reblogs")),
      excludeReplies: truthy(c.req.query("exclude_replies")),
    });
    return respondWithPage(c, rows);
  });

  app.get("/api/v1/timelines/home", async (c) => {
    const auth = requireUser(c, "read:statuses");
    if (!auth.ok) return auth.response;
    return respondWithPage(c, await statuses.homeTimeline(auth.value.account.id, readPage(c)));
  });

  app.get("/api/v1/timelines/public", async (c) => {
    const scope = truthy(c.req.query("local")) ? "local" : truthy(c.req.query("remote")) ? "remote" : "all";
    return respondWithPage(c, await statuses.publicTimeline(readPage(c), scope));
  });

  async function respondWithPage(c: Context<AuthEnv>, rows: StatusRow[]) {
    setLinkHeader(c, rows.map((r) => r.id));
    return c.json(await render.rows(c, rows, viewerId(c)));
  }

  return app;
}

