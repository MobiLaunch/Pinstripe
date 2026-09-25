import type { Federation } from "@fedify/fedify";
import { federation as federationMiddleware } from "@fedify/hono";
import { parseHandle } from "@pinstripe/core";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { type AuthEnv, bearerAuth } from "./auth/middleware.ts";
import type { FailureLimiter } from "./auth/rate-limit.ts";
import { authRoutes } from "./auth/routes.ts";
import type { AuthStore } from "./auth/store.ts";
import type { ContextData } from "./federation.ts";
import { serializeAccount } from "./mastodon.ts";
import type { LocalAccount, Store } from "./store.ts";

export interface AppOptions {
  federation: Federation<ContextData>;
  store: Store;
  auth: AuthStore;
  domain: string;
  loginLimiter?: FailureLimiter;
}

/**
 * HTTP entry point. Fedify answers ActivityPub, WebFinger and NodeInfo
 * requests first; everything else falls through to OAuth and the
 * Mastodon-compatible client API.
 */
export function buildApp({ federation, store, auth, domain, loginLimiter }: AppOptions) {
  const app = new Hono<AuthEnv>();

  app.use(federationMiddleware(federation, () => ({ store })));

  app.get("/health", (c) => c.json({ ok: true }));

  const notFound = (c: Context) => c.json({ error: "Record not found" }, 404);

  async function renderAccount(c: Context, account: LocalAccount) {
    const ctx = federation.createContext(c.req.raw, { store });
    const origin = ctx.canonicalOrigin;
    const followers = await store.listFollowers(account.id, "accepted");
    return serializeAccount(
      account,
      {
        profile: new URL(`/@${account.username}`, origin),
        actor: ctx.getActorUri(account.id),
        // Placeholder images until avatar/banner uploads exist; same paths as Mastodon.
        missingAvatar: new URL("/avatars/original/missing.png", origin),
        missingHeader: new URL("/headers/original/missing.png", origin),
      },
      { followers: followers.length, following: 0, statuses: 0 },
    );
  }

  // Token-based, never cookie-based, so any origin may call these (as on Mastodon).
  // The /oauth/authorize page is deliberately excluded.
  const api = cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"], maxAge: 86400 });
  for (const path of ["/api/*", "/oauth/token", "/oauth/revoke", "/.well-known/oauth-authorization-server"]) {
    app.use(path, api);
  }
  app.use("/api/*", bearerAuth(auth));
  // Registered before /api/v1/accounts/:id so verify_credentials isn't read as an id.
  app.route("/", authRoutes({ auth, store, renderAccount, loginLimiter }));

  app.get("/api/v1/accounts/lookup", async (c) => {
    const handle = parseHandle(c.req.query("acct") ?? "", domain);
    // Only local accounts for now; remote lookup comes with inbound federation.
    if (!handle || handle.domain !== domain.toLowerCase()) return notFound(c);
    const account = await store.getAccountByUsername(handle.username);
    return account ? c.json(await renderAccount(c, account)) : notFound(c);
  });

  app.get("/api/v1/accounts/:id", async (c) => {
    const account = await store.getAccount(c.req.param("id"));
    return account ? c.json(await renderAccount(c, account)) : notFound(c);
  });

  return app;
}
