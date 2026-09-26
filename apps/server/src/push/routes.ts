/**
 * Registering phones for push notifications (Pinstripe's own API; Mastodon
 * uses Web Push, which Expo apps can't receive):
 *
 *   POST   /api/v1/pinstripe/push   { expo_token, platform }
 *   DELETE /api/v1/pinstripe/push   { expo_token }
 */
import { Hono } from "hono";
import { type AuthEnv, requireUser } from "../auth/middleware.ts";
import { readParams } from "../http.ts";
import { isExpoPushToken, type PushService } from "./service.ts";

export function pushRoutes({ push }: { push: PushService }) {
  const app = new Hono<AuthEnv>();

  app.post("/api/v1/pinstripe/push", async (c) => {
    const auth = requireUser(c, "push");
    if (!auth.ok) return auth.response;
    const p = await readParams(c);
    const expoToken = (p.expo_token ?? "").trim();
    if (!isExpoPushToken(expoToken)) return c.json({ error: "Validation failed: That isn't an Expo push token" }, 422);
    await push.register({
      expoToken,
      accountId: auth.value.account.id,
      oauthTokenId: auth.value.token.id,
      platform: (p.platform ?? "").slice(0, 20),
    });
    return c.json({});
  });

  app.delete("/api/v1/pinstripe/push", async (c) => {
    const auth = requireUser(c, "push");
    if (!auth.ok) return auth.response;
    await push.unregister(((await readParams(c)).expo_token ?? "").trim(), auth.value.account.id);
    return c.json({});
  });

  return app;
}
