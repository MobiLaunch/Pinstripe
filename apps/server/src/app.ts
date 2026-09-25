import type { Federation } from "@fedify/fedify";
import { federation as federationMiddleware } from "@fedify/hono";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { accountRoutes } from "./accounts/routes.ts";
import { type AuthEnv, bearerAuth } from "./auth/middleware.ts";
import type { FailureLimiter } from "./auth/rate-limit.ts";
import { authRoutes } from "./auth/routes.ts";
import type { AuthStore } from "./auth/store.ts";
import type { ContextData } from "./federation.ts";
import { serializeAccount } from "./mastodon.ts";
import { actorUri } from "./statuses/activitypub.ts";
import { statusRenderer } from "./statuses/render.ts";
import { statusRoutes } from "./statuses/routes.ts";
import type { StatusStore } from "./statuses/store.ts";
import { type AccountRow, isLocal, type Store } from "./store.ts";

export interface AppOptions {
  federation: Federation<ContextData>;
  store: Store;
  statuses: StatusStore;
  auth: AuthStore;
  domain: string;
  loginLimiter?: FailureLimiter;
}

/**
 * HTTP entry point. Fedify answers ActivityPub, WebFinger and NodeInfo
 * requests first; everything else falls through to OAuth and the
 * Mastodon-compatible client API.
 */
export function buildApp({ federation, store, statuses, auth, domain, loginLimiter }: AppOptions) {
  const app = new Hono<AuthEnv>();

  const contextData = { store, statuses };
  app.use(federationMiddleware(federation, () => contextData));
  const federationContext = (c: Context) => federation.createContext(c.req.raw, contextData);

  app.get("/health", (c) => c.json({ ok: true }));

  /** Any account as Mastodon JSON. Local counts are computed; remote ones are what their server reported. */
  async function renderAccount(c: Context, account: AccountRow) {
    const ctx = federationContext(c);
    const origin = ctx.canonicalOrigin;
    // Placeholder images until avatar/banner uploads exist; same paths as Mastodon.
    const missingAvatar = new URL("/avatars/original/missing.png", origin).href;
    const missingHeader = new URL("/headers/original/missing.png", origin).href;
    if (isLocal(account)) {
      const [follows, statusCount] = await Promise.all([store.followCounts(account.id), statuses.countByAccount(account.id)]);
      return serializeAccount(
        account,
        {
          profile: new URL(`/@${account.username}`, origin).href,
          actor: actorUri(ctx, account).href,
          avatar: missingAvatar,
          header: missingHeader,
        },
        { followers: follows.followers, following: follows.following, statuses: statusCount },
      );
    }
    return serializeAccount(
      account,
      {
        profile: account.url ?? account.uri!,
        actor: account.uri!,
        avatar: account.avatarUrl ?? missingAvatar,
        header: account.headerUrl ?? missingHeader,
      },
      {
        followers: account.followersCount ?? 0,
        following: account.followingCount ?? 0,
        statuses: account.statusesCount ?? (await statuses.countByAccount(account.id)),
      },
    );
  }

  const render = statusRenderer({ statuses, renderAccount, federationContext });

  // Token-based, never cookie-based, so any origin may call these (as on Mastodon).
  // The /oauth/authorize page is deliberately excluded.
  const api = cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"], exposeHeaders: ["Link"], maxAge: 86400 });
  for (const path of ["/api/*", "/oauth/token", "/oauth/revoke", "/.well-known/oauth-authorization-server"]) {
    app.use(path, api);
  }
  app.use("/api/*", bearerAuth(auth));

  // Fixed paths (verify_credentials, lookup, relationships…) are registered
  // before /api/v1/accounts/:id so they aren't read as ids.
  app.route("/", authRoutes({ auth, store, renderAccount, loginLimiter }));
  app.route("/", statusRoutes({ store, statuses, domain, render, federationContext }));
  app.route(
    "/",
    accountRoutes({
      store,
      domain,
      renderAccount,
      renderStatuses: (c, rows) => render.rows(c, rows, c.get("token")?.account?.id ?? null),
      federationContext,
    }),
  );

  return app;
}
