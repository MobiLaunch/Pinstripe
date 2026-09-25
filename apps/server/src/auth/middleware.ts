import type { Context, MiddlewareHandler } from "hono";
import type { LocalAccount } from "../store.ts";
import { hasScope } from "./scopes.ts";
import type { AccessToken, AuthStore } from "./store.ts";

export type AuthEnv = { Variables: { token: AccessToken | null } };

/**
 * Resolves `Authorization: Bearer …` to a token. A missing header just means
 * anonymous; a present but invalid one is a 401, as in Mastodon.
 */
export function bearerAuth(auth: AuthStore): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const header = c.req.header("authorization");
    if (!header) {
      c.set("token", null);
      return next();
    }
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    const token = match ? await auth.findToken(match[1]!) : null;
    if (!token) return c.json({ error: "The access token is invalid" }, 401);
    c.set("token", token);
    return next();
  };
}

type Result<T> = { ok: true; value: T } | { ok: false; response: Response };

/** Requires a token with at least one of `scopes`. */
export function requireToken(c: Context<AuthEnv>, ...scopes: string[]): Result<AccessToken> {
  const token = c.get("token");
  if (!token) return { ok: false, response: c.json({ error: "The access token is invalid" }, 401) };
  if (scopes.length && !scopes.some((s) => hasScope(token.scopes, s))) {
    return { ok: false, response: c.json({ error: "This action is outside the authorized scopes" }, 403) };
  }
  return { ok: true, value: token };
}

/** Requires a token that belongs to a signed-in user, not just an app. */
export function requireUser(c: Context<AuthEnv>, ...scopes: string[]): Result<{ token: AccessToken; account: LocalAccount }> {
  const result = requireToken(c, ...scopes);
  if (!result.ok) return result;
  const { account } = result.value;
  if (!account) return { ok: false, response: c.json({ error: "This method requires an authenticated user" }, 422) };
  return { ok: true, value: { token: result.value, account } };
}
