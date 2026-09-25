import type { Federation } from "@fedify/fedify";
import { federation as federationMiddleware } from "@fedify/hono";
import { parseHandle } from "@pinstripe/core";
import { type Context, Hono } from "hono";
import type { ContextData } from "./federation.ts";
import { serializeAccount } from "./mastodon.ts";
import type { LocalAccount, Store } from "./store.ts";

export interface AppOptions {
  federation: Federation<ContextData>;
  store: Store;
  domain: string;
}

/**
 * HTTP entry point. Fedify answers ActivityPub, WebFinger and NodeInfo
 * requests first; everything else falls through to the Mastodon-compatible
 * client API.
 */
export function buildApp({ federation, store, domain }: AppOptions) {
  const app = new Hono();

  app.use(federationMiddleware(federation, () => ({ store })));

  app.get("/health", (c) => c.json({ ok: true }));

  const notFound = (c: Context) => c.json({ error: "Record not found" }, 404);

  async function renderAccount(c: Context, account: LocalAccount) {
    const ctx = federation.createContext(c.req.raw, { store });
    // Placeholder images until avatar/banner uploads exist; same paths as Mastodon.
    const origin = ctx.canonicalOrigin;
    const followers = await store.listFollowers(account.id, "accepted");
    return c.json(
      serializeAccount(
        account,
        {
          profile: new URL(`/@${account.username}`, origin),
          actor: ctx.getActorUri(account.id),
          missingAvatar: new URL("/avatars/original/missing.png", origin),
          missingHeader: new URL("/headers/original/missing.png", origin),
        },
        { followers: followers.length, following: 0, statuses: 0 },
      ),
    );
  }

  app.get("/api/v1/accounts/lookup", async (c) => {
    const handle = parseHandle(c.req.query("acct") ?? "", domain);
    // Only local accounts for now; remote lookup comes with inbound federation.
    if (!handle || handle.domain !== domain.toLowerCase()) return notFound(c);
    const account = await store.getAccountByUsername(handle.username);
    return account ? renderAccount(c, account) : notFound(c);
  });

  app.get("/api/v1/accounts/:id", async (c) => {
    const account = await store.getAccount(c.req.param("id"));
    return account ? renderAccount(c, account) : notFound(c);
  });

  return app;
}
