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
import { profileRoutes } from "./accounts/profile.ts";
import { serializeAccount, serializeRelationship, toMastodonVisibility } from "./mastodon.ts";
import { mediaRoutes } from "./media/routes.ts";
import { notificationRoutes } from "./notifications/routes.ts";
import { NotificationStore } from "./notifications/store.ts";
import { safetyRoutes } from "./safety/routes.ts";
import { hiddenNotification } from "./safety/sql.ts";
import { type Role, SafetyStore } from "./safety/store.ts";
import type { MediaService } from "./media/service.ts";
import { actorUri } from "./statuses/activitypub.ts";
import { statusRenderer } from "./statuses/render.ts";
import { statusRoutes } from "./statuses/routes.ts";
import type { StatusStore } from "./statuses/store.ts";
import { type AccountRow, isLocal, type Store } from "./store.ts";

export interface AppOptions {
  federation: Federation<ContextData>;
  store: Store;
  statuses: StatusStore;
  media: MediaService;
  auth: AuthStore;
  domain: string;
  loginLimiter?: FailureLimiter;
}

/** Mastodon's Role entity. Permissions are Mastodon's bit flags: 1 administrator, 16 manage reports, 1024 manage users. */
function roleJson(role: Role) {
  const [id, permissions] = { user: ["-99", "0"], moderator: ["2", String(16 | 1024)], admin: ["3", "1"] }[role];
  return { id, name: role === "user" ? "" : role[0]!.toUpperCase() + role.slice(1), permissions, color: "", highlighted: role !== "user" };
}

/**
 * HTTP entry point. Fedify answers ActivityPub, WebFinger and NodeInfo
 * requests first; everything else falls through to OAuth and the
 * Mastodon-compatible client API.
 */
export function buildApp({ federation, store, statuses, media, auth, domain, loginLimiter }: AppOptions) {
  const app = new Hono<AuthEnv>();

  const safety = new SafetyStore(store.db, store);
  const contextData = { store, statuses, media, safety };
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
          avatar: account.avatarKey ? media.storage.url(account.avatarKey) : missingAvatar,
          header: account.headerKey ? media.storage.url(account.headerKey) : missingHeader,
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

  async function renderCredentialAccount(c: Context, account: AccountRow) {
    const json = await renderAccount(c, account);
    return {
      ...json,
      source: {
        privacy: toMastodonVisibility(account.settings.defaultVisibility),
        sensitive: false,
        language: null,
        // The plain text as typed, for editing.
        note: account.bio,
        fields: json.fields,
        follow_requests_count: (await store.followCounts(account.id)).requests,
      },
      role: roleJson(await safety.role(account.id)),
    };
  }

  async function relationshipsJson(viewerId: string, ids: string[]) {
    const [follows, targets] = await Promise.all([store.relationships(viewerId, ids), store.getAccounts(ids)]);
    const blocking = await safety.relationships(viewerId, targets);
    return targets
      .filter((t) => follows.has(t.id))
      .map((t) => serializeRelationship(t.id, follows.get(t.id)!, blocking.get(t.id)));
  }

  const render = statusRenderer({ statuses, media, renderAccount, federationContext });

  // Token-based, never cookie-based, so any origin may call these (as on Mastodon).
  // The /oauth/authorize page is deliberately excluded.
  const api = cors({ origin: "*", allowHeaders: ["Authorization", "Content-Type"], exposeHeaders: ["Link"], maxAge: 86400 });
  for (const path of ["/api/*", "/oauth/token", "/oauth/revoke", "/.well-known/oauth-authorization-server"]) {
    app.use(path, api);
  }
  app.use("/api/*", bearerAuth(auth));

  // Fixed paths (verify_credentials, lookup, relationships…) are registered
  // before /api/v1/accounts/:id so they aren't read as ids.
  app.route("/", authRoutes({ auth, renderCredentialAccount, loginLimiter }));
  app.route("/", profileRoutes({ store, media, renderCredentialAccount, federationContext }));
  app.route("/", mediaRoutes({ media }));
  app.route(
    "/",
    notificationRoutes({
      store,
      statuses,
      notifications: new NotificationStore(store.db),
      render,
      renderAccount,
      hiddenFor: hiddenNotification,
    }),
  );
  app.route("/", statusRoutes({ store, statuses, media, domain, render, federationContext }));
  app.route(
    "/",
    safetyRoutes({
      store,
      statuses,
      safety,
      renderAccount,
      renderStatuses: (c, rows, viewerId) => render.rows(c, rows, viewerId),
      relationship: async (viewerId, id) => (await relationshipsJson(viewerId, [id]))[0]!,
      federationContext,
    }),
  );
  app.route(
    "/",
    accountRoutes({
      store,
      safety,
      relationshipsJson,
      domain,
      renderAccount,
      renderStatuses: (c, rows) => render.rows(c, rows, c.get("token")?.account?.id ?? null),
      federationContext,
    }),
  );

  return app;
}
