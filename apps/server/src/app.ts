import type { Federation } from "@fedify/fedify";
import { federation as federationMiddleware } from "@fedify/hono";
import { formatHandle } from "@pinstripe/core";
import { Hono } from "hono";
import type { ContextData } from "./federation.ts";
import type { Store } from "./store.ts";

export interface AppOptions {
  federation: Federation<ContextData>;
  store: Store;
  domain: string;
}

/**
 * HTTP entry point. Fedify answers ActivityPub, WebFinger and NodeInfo
 * requests first; everything else falls through to the client API routes.
 */
export function buildApp({ federation, store, domain }: AppOptions) {
  const app = new Hono();

  app.use(federationMiddleware(federation, () => ({ store })));

  app.get("/health", (c) => c.json({ ok: true }));

  // Client API: grows with the app. Shapes follow @pinstripe/core.
  app.get("/api/v1/accounts/lookup", async (c) => {
    const username = c.req.query("acct")?.replace(/^@/, "").split("@")[0];
    const account = username ? await store.getAccountByUsername(username) : null;
    if (!account) return c.json({ error: "Record not found" }, 404);
    return c.json({
      id: account.id,
      username: account.username,
      acct: formatHandle({ username: account.username, domain }),
      displayName: account.displayName,
      bio: account.bio,
      fields: account.fields,
      bot: account.bot,
      locked: account.settings.approveFollowers,
      createdAt: account.createdAt.toISOString(),
    });
  });

  return app;
}
