/**
 * Public web pages (see pages.ts) and the redirects that make our URLs
 * work in a browser:
 *
 *   GET /                    the server's latest public posts
 *   GET /@user               profile; ActivityPub clients are sent to the actor
 *   GET /@user/:id           a post and its replies; ActivityPub clients are sent to the Note
 *   GET /tags/:name          public posts with a hashtag
 *   GET /users/:id[/statuses/:sid]   (HTML) → the pages above; Fedify answers ActivityPub first
 */
import type { Context as FedifyContext } from "@fedify/fedify";
import { type Context, Hono } from "hono";
import type { ContextData } from "../federation.ts";
import type { MastodonAccount, MastodonStatus } from "../mastodon.ts";
import { noteUri } from "../statuses/activitypub.ts";
import type { StatusRow, StatusStore } from "../statuses/store.ts";
import type { AccountRow, Store } from "../store.ts";
import { notFoundPage, page, postCard, profilePage, statusPage, tagPage } from "./pages.ts";

export interface WebRoutesOptions {
  store: Store;
  statuses: StatusStore;
  domain: string;
  renderAccount: (c: Context, account: AccountRow) => Promise<MastodonAccount>;
  renderStatuses: (c: Context, rows: StatusRow[]) => Promise<MastodonStatus[]>;
  federationContext: (c: Context) => FedifyContext<ContextData>;
}

const headers = {
  "Content-Security-Policy": "default-src 'none'; img-src * data:; media-src *; style-src 'unsafe-inline'; frame-ancestors 'none'",
  "Cache-Control": "public, max-age=60",
};

const wantsActivityPub = (c: Context) => /application\/(activity|ld)\+json/.test(c.req.header("accept") ?? "");

export function webRoutes({ store, statuses, domain, renderAccount, renderStatuses, federationContext }: WebRoutesOptions) {
  const app = new Hono();
  const origin = (c: Context) => federationContext(c).canonicalOrigin;
  const missing = (c: Context, message?: string) => c.html(notFoundPage(origin(c), message), 404, headers);

  async function localAccount(c: Context) {
    const handle = (c.req.param("handle") ?? "").replace(/^@/, "");
    const account = await store.getAccountByUsername(handle);
    return account ?? null;
  }

  app.get("/", async (c) => {
    const rows = await statuses.publicTimeline({ limit: 20 }, "local");
    const list = await renderStatuses(c, rows);
    return c.html(
      page({
        title: "Pinstripe",
        origin: origin(c),
        body: `<p class="app">Short videos for the fediverse. Here's what people on ${domain} are posting.</p>${
          list.length ? list.map((s) => postCard(s, domain)).join("") : '<p class="empty">No public posts yet.</p>'
        }`,
      }),
      200,
      headers,
    );
  });

  app.get("/:handle{@[^/]+}", async (c) => {
    const account = await localAccount(c);
    if (!account) return missing(c);
    const ctx = federationContext(c);
    if (wantsActivityPub(c)) return c.redirect(ctx.getActorUri(account.id).href, 302);
    if (account.suspendedAt) return missing(c, "This account has been suspended.");
    const rows = await statuses.accountStatuses(account.id, { limit: 20 }, { viewerId: null, excludeReplies: true });
    return c.html(
      profilePage({
        account: await renderAccount(c, account),
        statuses: await renderStatuses(c, rows),
        domain,
        origin: origin(c),
        actorUri: ctx.getActorUri(account.id).href,
        hideCounts: account.settings.hideFollowerCounts,
      }),
      200,
      headers,
    );
  });

  app.get("/:handle{@[^/]+}/:id", async (c) => {
    const account = await localAccount(c);
    const status = account ? await statuses.getVisible(c.req.param("id"), null) : null;
    if (!account || !status || status.accountId !== account.id || status.reblogOfId) return missing(c);
    if (wantsActivityPub(c)) return c.redirect(noteUri(federationContext(c), status).href, 302);
    const { descendants } = await statuses.context(status, null);
    const [json, ...replies] = await renderStatuses(c, [status, ...descendants.slice(0, 40)]);
    return c.html(statusPage({ status: json!, replies, domain, origin: origin(c) }), 200, headers);
  });

  app.get("/tags/:name", async (c) => {
    const tag = c.req.param("name").toLowerCase();
    if (!/^[\p{L}\p{N}_]+$/u.test(tag)) return missing(c);
    const rows = await statuses.tagTimeline(tag, { limit: 20 }, { viewerId: null });
    return c.html(tagPage({ tag, statuses: await renderStatuses(c, rows), domain, origin: origin(c) }), 200, headers);
  });

  // Fedify serves these to ActivityPub clients; a browser lands here instead.
  // (An ActivityPub request only gets here when Fedify found nothing: a 404.)
  app.get("/users/:id", async (c) => {
    if (wantsActivityPub(c)) return c.json({ error: "Not found" }, 404);
    const account = await store.getLocalAccount(c.req.param("id"));
    return account ? c.redirect(`/@${account.username}`, 302) : missing(c);
  });
  app.get("/users/:id/statuses/:sid", async (c) => {
    if (wantsActivityPub(c)) return c.json({ error: "Not found" }, 404);
    const account = await store.getLocalAccount(c.req.param("id"));
    return account ? c.redirect(`/@${account.username}/${c.req.param("sid")}`, 302) : missing(c);
  });

  return app;
}
