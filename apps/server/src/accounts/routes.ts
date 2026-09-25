/**
 * Mastodon's account API beyond sign-up:
 *
 *   GET  /api/v1/accounts/lookup?acct=         local or already-known remote accounts
 *   GET  /api/v1/accounts/search?q=&resolve=   and /api/v2/search
 *   GET  /api/v1/accounts/relationships?id[]=
 *   GET  /api/v1/accounts/:id
 *   POST /api/v1/accounts/:id/follow           and /unfollow
 *   GET  /api/v1/accounts/:id/followers        and /following
 *   GET  /api/v1/follow_requests
 *   POST /api/v1/follow_requests/:id/authorize and /reject
 *
 * Follows of remote accounts send Follow / Undo(Follow); answering a remote
 * follow request sends Accept / Reject.
 */
import type { Context as FedifyContext } from "@fedify/fedify";
import { isActor, Note } from "@fedify/vocab";
import { parseHandle } from "@pinstripe/core";
import { type Context, Hono } from "hono";
import { type AuthEnv, requireUser } from "../auth/middleware.ts";
import type { ContextData } from "../federation.ts";
import { notFound, readLimit, setLinkHeader, truthy } from "../http.ts";
import { type MastodonAccount, type MastodonStatus, serializeRelationship } from "../mastodon.ts";
import { persistActor, resolveHandle } from "../remote/actors.ts";
import { deliver } from "../remote/deliver.ts";
import { persistNote } from "../remote/notes.ts";
import { buildFollow, buildFollowResponse, buildUndo, followActivityUri } from "../statuses/activitypub.ts";
import type { StatusRow } from "../statuses/store.ts";
import { type AccountRow, isLocal, type Store } from "../store.ts";

export interface AccountRoutesOptions {
  store: Store;
  domain: string;
  renderAccount: (c: Context, account: AccountRow) => Promise<MastodonAccount>;
  renderStatuses: (c: Context, rows: StatusRow[]) => Promise<MastodonStatus[]>;
  federationContext: (c: Context) => FedifyContext<ContextData>;
}

const SEARCH_LIMIT = 40;

export function accountRoutes({ store, domain, renderAccount, renderStatuses, federationContext }: AccountRoutesOptions) {
  const app = new Hono<AuthEnv>();
  const viewerId = (c: Context<AuthEnv>) => c.get("token")?.account?.id ?? null;
  const renderAll = (c: Context, rows: AccountRow[]) => Promise.all(rows.map((a) => renderAccount(c, a)));

  async function relationshipJson(viewer: string, id: string) {
    const r = (await store.relationships(viewer, [id])).get(id)!;
    return serializeRelationship(id, r);
  }

  app.get("/api/v1/accounts/lookup", async (c) => {
    const handle = parseHandle(c.req.query("acct") ?? "", domain);
    if (!handle) return notFound(c);
    const local = handle.domain === domain.toLowerCase();
    const account = await store.getAccountByHandle(handle.username, local ? null : handle.domain);
    return account ? c.json(await renderAccount(c, account)) : notFound(c);
  });

  /**
   * Finds accounts (and, for a pasted post URL, the post). A full handle or
   * URL is looked up on its server when `resolve` is set and someone is
   * signed in, so anonymous requests can't make us fetch arbitrary URLs.
   */
  async function search(c: Context<AuthEnv>, q: string, options: { resolve: boolean; limit: number }) {
    const ctx = federationContext(c);
    const resolve = options.resolve && !!viewerId(c);
    const accounts: AccountRow[] = [];
    const statuses: StatusRow[] = [];
    const trimmed = q.trim();

    if (/^https?:\/\//i.test(trimmed)) {
      if (resolve) {
        const object = await ctx.lookupObject(trimmed).catch(() => null);
        if (isActor(object)) {
          const account = await persistActor(ctx, object);
          if (account) accounts.push(account);
        } else if (object instanceof Note) {
          const status = await persistNote(ctx, object, { force: true });
          if (status) statuses.push(status);
        }
      }
    } else if (trimmed) {
      const handle = trimmed.includes("@", 1) || trimmed.startsWith("@") ? parseHandle(trimmed, domain) : null;
      if (handle && trimmed.replace(/^@/, "").includes("@")) {
        const account = await resolveHandle(ctx, handle.username, handle.domain, { resolve });
        if (account) accounts.push(account);
      }
      for (const a of await store.searchAccounts(trimmed.replace(/^@/, "").split("@")[0]!, options.limit)) {
        if (!accounts.some((x) => x.id === a.id) && accounts.length < options.limit) accounts.push(a);
      }
    }
    return { accounts, statuses };
  }

  app.get("/api/v1/accounts/search", async (c) => {
    const { accounts } = await search(c, c.req.query("q") ?? "", {
      resolve: truthy(c.req.query("resolve")),
      limit: readLimit(c, SEARCH_LIMIT, SEARCH_LIMIT),
    });
    return c.json(await renderAll(c, accounts));
  });

  app.get("/api/v2/search", async (c) => {
    const type = c.req.query("type");
    const { accounts, statuses } = await search(c, c.req.query("q") ?? "", {
      resolve: truthy(c.req.query("resolve")),
      limit: readLimit(c, 20, SEARCH_LIMIT),
    });
    return c.json({
      accounts: !type || type === "accounts" ? await renderAll(c, accounts) : [],
      statuses: !type || type === "statuses" ? await renderStatuses(c, statuses) : [],
      hashtags: [],
    });
  });

  app.get("/api/v1/accounts/relationships", async (c) => {
    const auth = requireUser(c, "read:follows");
    if (!auth.ok) return auth.response;
    const url = new URL(c.req.url);
    const ids = [...url.searchParams.getAll("id[]"), ...url.searchParams.getAll("id")];
    const map = await store.relationships(auth.value.account.id, ids);
    return c.json(ids.filter((id) => map.has(id)).map((id) => serializeRelationship(id, map.get(id)!)));
  });

  app.get("/api/v1/follow_requests", async (c) => {
    const auth = requireUser(c, "read:follows", "follow");
    if (!auth.ok) return auth.response;
    const rows = await store.followList(auth.value.account.id, "requests", {
      maxId: c.req.query("max_id"),
      limit: readLimit(c, 40, 80),
    });
    setLinkHeader(c, rows.map((r) => r.followId));
    return c.json(await renderAll(c, rows.map((r) => r.account)));
  });

  for (const action of ["authorize", "reject"] as const) {
    app.post(`/api/v1/follow_requests/:id/${action}`, async (c) => {
      const auth = requireUser(c, "write:follows", "follow");
      if (!auth.ok) return auth.response;
      const me = auth.value.account.id;
      const requester = await store.getAccount(c.req.param("id"));
      const follow = requester ? await store.getFollow(requester.id, me) : null;
      if (!requester || follow?.state !== "pending") return notFound(c);
      if (action === "authorize") await store.acceptFollow(requester.id, me);
      else await store.unfollow(requester.id, me);
      if (!isLocal(requester)) {
        const ctx = federationContext(c);
        await deliver(ctx, me, buildFollowResponse(ctx, action === "authorize" ? "accept" : "reject", follow, requester), {
          to: [requester],
        });
      }
      return c.json(await relationshipJson(me, requester.id));
    });
  }

  app.get("/api/v1/accounts/:id", async (c) => {
    const account = await store.getAccount(c.req.param("id"));
    return account ? c.json(await renderAccount(c, account)) : notFound(c);
  });

  app.post("/api/v1/accounts/:id/follow", async (c) => {
    const auth = requireUser(c, "write:follows", "follow");
    if (!auth.ok) return auth.response;
    const me = auth.value.account.id;
    const target = await store.getAccount(c.req.param("id"));
    if (!target) return notFound(c);
    if (target.id === me) return c.json({ error: "You can't follow yourself" }, 403);

    const existing = await store.getFollow(me, target.id);
    if (!existing) {
      const ctx = federationContext(c);
      if (isLocal(target)) {
        await store.follow({ followerId: me, followingId: target.id, state: target.settings.approveFollowers ? "pending" : "accepted", uri: null });
      } else {
        // Remote follows stay requests until their server sends Accept.
        const row = await store.follow({
          followerId: me,
          followingId: target.id,
          state: "pending",
          uri: (id) => followActivityUri(ctx, me, id).href,
        });
        await deliver(ctx, me, buildFollow(ctx, row, target), { to: [target] });
      }
    }
    return c.json(await relationshipJson(me, target.id));
  });

  app.post("/api/v1/accounts/:id/unfollow", async (c) => {
    const auth = requireUser(c, "write:follows", "follow");
    if (!auth.ok) return auth.response;
    const me = auth.value.account.id;
    const target = await store.getAccount(c.req.param("id"));
    if (!target) return notFound(c);
    const removed = await store.unfollow(me, target.id);
    if (removed && !isLocal(target)) {
      const ctx = federationContext(c);
      await deliver(ctx, me, buildUndo(ctx, me, buildFollow(ctx, removed, target)), { to: [target] });
    }
    return c.json(await relationshipJson(me, target.id));
  });

  for (const side of ["followers", "following"] as const) {
    app.get(`/api/v1/accounts/:id/${side}`, async (c) => {
      const account = await store.getAccount(c.req.param("id"));
      if (!account) return notFound(c);
      // Hidden lists stay hidden from everyone but their owner.
      if (isLocal(account) && account.settings.hideFollowerCounts && viewerId(c) !== account.id) return c.json([]);
      const rows = await store.followList(account.id, side, { maxId: c.req.query("max_id"), limit: readLimit(c, 40, 80) });
      setLinkHeader(c, rows.map((r) => r.followId));
      return c.json(await renderAll(c, rows.map((r) => r.account)));
    });
  }

  return app;
}
