/**
 * Mastodon-compatible OAuth 2 and account registration:
 *
 *   POST /api/v1/apps                    register a client
 *   GET  /api/v1/apps/verify_credentials
 *   GET  /oauth/authorize                browser sign-in + consent (code + PKCE)
 *   POST /oauth/token                    authorization_code | password | client_credentials
 *   POST /oauth/revoke
 *   POST /api/v1/accounts                sign up (needs an app token)
 *   GET  /api/v1/accounts/verify_credentials
 *   GET  /.well-known/oauth-authorization-server
 */
import { isValidUsername, USERNAME_MAX_LENGTH } from "@pinstripe/core";
import { type Context, Hono } from "hono";
import { readParams } from "../http.ts";
import type { MastodonAccount } from "../mastodon.ts";
import { type LocalAccount, UsernameTakenError } from "../store.ts";
import { type AuthorizeParams, authorizePage, codePage, errorPage } from "./authorize-page.ts";
import { type AuthEnv, requireToken, requireUser } from "./middleware.ts";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./passwords.ts";
import { FailureLimiter } from "./rate-limit.ts";
import { parseScopes, scopesAllowed } from "./scopes.ts";
import { pkceChallenge, safeEqual } from "./secrets.ts";
import { type AuthStore, EmailTakenError, type OAuthApp } from "./store.ts";

export const OOB_REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob";

export interface AuthRoutesOptions {
  auth: AuthStore;
  /** Mastodon's CredentialAccount: the account plus its editable `source`. */
  renderCredentialAccount: (c: Context, account: LocalAccount) => Promise<MastodonAccount>;
  /** 10 failed logins per 15 minutes per username/email by default. */
  loginLimiter?: FailureLimiter;
  /** After sign-up: send the confirmation email. */
  onRegistered?: (c: Context, account: LocalAccount, email: string) => Promise<void>;
}

function validRedirectUri(uri: string): boolean {
  if (uri === OOB_REDIRECT_URI) return true;
  try {
    const url = new URL(uri);
    // Custom schemes (pinstripe://) are how mobile apps receive the code.
    return !["javascript:", "data:", "vbscript:", "file:"].includes(url.protocol) && !url.hash;
  } catch {
    return false;
  }
}

function tokenResponse(token: string, scopes: string[], createdAt: Date) {
  return {
    access_token: token,
    token_type: "Bearer",
    scope: scopes.join(" "),
    created_at: Math.floor(createdAt.getTime() / 1000),
  };
}

function appResponse(app: OAuthApp) {
  return {
    id: app.id,
    name: app.name,
    website: app.website,
    scopes: app.scopes,
    redirect_uri: app.redirectUris.join("\n"),
    redirect_uris: app.redirectUris,
  };
}

const WRONG_LOGIN = "That username or password isn't right.";
export const SUSPENDED = "This account has been suspended by the server's moderators.";

const oauthError = (c: Context, error: string, description: string, status: 400 | 401 = 400) =>
  c.json({ error, error_description: description }, status);

export function authRoutes({ auth, renderCredentialAccount, loginLimiter = new FailureLimiter(10, 15 * 60 * 1000), onRegistered }: AuthRoutesOptions) {
  const app = new Hono<AuthEnv>();

  /** Checks a login, counting failures per username/email. */
  async function login(loginName: string, password: string) {
    const key = loginName.trim().replace(/^@/, "").toLowerCase();
    if (!key || !password) return { account: null, error: WRONG_LOGIN };
    if (loginLimiter.isBlocked(key)) return { account: null, error: "Too many failed attempts. Try again in a few minutes." };
    const account = await auth.verifyLogin(key, password);
    if (!account) {
      loginLimiter.recordFailure(key);
      return { account: null, error: WRONG_LOGIN };
    }
    loginLimiter.reset(key);
    if (account.suspendedAt) return { account: null, error: SUSPENDED };
    return { account, error: null };
  }

  app.get("/.well-known/oauth-authorization-server", (c) => {
    const origin = new URL(c.req.url).origin;
    return c.json({
      issuer: `${origin}/`,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      revocation_endpoint: `${origin}/oauth/revoke`,
      app_registration_endpoint: `${origin}/api/v1/apps`,
      scopes_supported: ["read", "write", "follow", "push", "profile"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "password", "client_credentials"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    });
  });

  app.post("/api/v1/apps", async (c) => {
    const p = await readParams(c);
    const name = p.client_name?.trim();
    const redirectUris = (p.redirect_uris ?? "").split(/\s+/).filter(Boolean);
    const scopes = parseScopes(p.scopes);
    if (!name) return c.json({ error: "Validation failed: Name can't be blank" }, 422);
    if (name.length > 60) return c.json({ error: "Validation failed: Name is too long" }, 422);
    if (!redirectUris.length || !redirectUris.every(validRedirectUri)) {
      return c.json({ error: "Validation failed: Redirect URI must be an absolute URI." }, 422);
    }
    if (!scopes) return c.json({ error: "Validation failed: Scopes are invalid" }, 422);
    const website = p.website?.trim() || null;
    const { app: created, clientSecret } = await auth.createApp({ name, website, redirectUris, scopes });
    return c.json({
      ...appResponse(created),
      client_id: created.clientId,
      client_secret: clientSecret,
      client_secret_expires_at: 0,
    });
  });

  app.get("/api/v1/apps/verify_credentials", (c) => {
    const result = requireToken(c);
    if (!result.ok) return result.response;
    return c.json(appResponse(result.value.app));
  });

  /** Validates an authorize request; on failure returns a page, never a redirect. */
  async function checkAuthorize(p: Record<string, string>) {
    const params: AuthorizeParams = {
      client_id: p.client_id ?? "",
      redirect_uri: p.redirect_uri ?? "",
      scope: p.scope ?? "",
      state: p.state ?? "",
      code_challenge: p.code_challenge ?? "",
      code_challenge_method: p.code_challenge_method ?? "",
    };
    const client = await auth.getAppByClientId(params.client_id);
    if (!client) return { error: "This app isn't registered with Pinstripe." } as const;
    // An unregistered redirect_uri must never receive a redirect: that's how codes get stolen.
    if (!client.redirectUris.includes(params.redirect_uri)) {
      return { error: "The redirect URI doesn't match what this app registered." } as const;
    }
    if (p.response_type !== undefined && p.response_type !== "code") {
      return { error: "Only response_type=code is supported." } as const;
    }
    const scopes = parseScopes(params.scope);
    if (!scopes || !scopesAllowed(scopes, client.scopes)) {
      return { error: "This app asked for permissions it didn't register for." } as const;
    }
    if (params.code_challenge && params.code_challenge_method !== "S256") {
      return { error: "Only the S256 code challenge method is supported." } as const;
    }
    return { client, scopes, params } as const;
  }

  const htmlHeaders = {
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
    "Cache-Control": "no-store",
  };

  app.get("/oauth/authorize", async (c) => {
    const checked = await checkAuthorize(c.req.query());
    if ("error" in checked) return c.html(errorPage(checked.error!), 400, htmlHeaders);
    const { client, scopes, params } = checked;
    return c.html(authorizePage({ appName: client.name, scopes, params }), 200, htmlHeaders);
  });

  app.post("/oauth/authorize", async (c) => {
    const p = await readParams(c);
    const checked = await checkAuthorize(p);
    if ("error" in checked) return c.html(errorPage(checked.error!), 400, htmlHeaders);
    const { client, scopes, params } = checked;

    const back = (query: Record<string, string>) => {
      const url = new URL(params.redirect_uri);
      for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
      if (params.state) url.searchParams.set("state", params.state);
      return c.redirect(url.href, 302);
    };

    if (p.decision === "deny") {
      if (params.redirect_uri === OOB_REDIRECT_URI) return c.html(errorPage("You denied access."), 200, htmlHeaders);
      return back({ error: "access_denied", error_description: "The user denied the request." });
    }

    const loginName = p.login ?? "";
    const { account, error } = await login(loginName, p.password ?? "");
    if (!account) {
      return c.html(authorizePage({ appName: client.name, scopes, params, login: loginName, error }), 401, htmlHeaders);
    }

    const code = await auth.createCode({
      appId: client.id,
      accountId: account.id,
      redirectUri: params.redirect_uri,
      scopes,
      codeChallenge: params.code_challenge || null,
    });
    if (params.redirect_uri === OOB_REDIRECT_URI) return c.html(codePage(client.name, code), 200, htmlHeaders);
    return back({ code });
  });

  /** Client credentials from HTTP Basic or the body, per RFC 6749 §2.3.1. */
  function clientCredentials(c: Context, p: Record<string, string>) {
    const basic = /^Basic\s+(\S+)$/i.exec(c.req.header("authorization") ?? "");
    if (basic) {
      const decoded = Buffer.from(basic[1]!, "base64").toString();
      const i = decoded.indexOf(":");
      if (i > 0) return { id: decodeURIComponent(decoded.slice(0, i)), secret: decodeURIComponent(decoded.slice(i + 1)) };
    }
    return { id: p.client_id ?? "", secret: p.client_secret ?? "" };
  }

  app.post("/oauth/token", async (c) => {
    c.header("Cache-Control", "no-store");
    const p = await readParams(c);
    const creds = clientCredentials(c, p);
    const client = creds.id && creds.secret ? await auth.authenticateApp(creds.id, creds.secret) : null;
    if (!client) return oauthError(c, "invalid_client", "Client authentication failed.", 401);

    switch (p.grant_type) {
      case "authorization_code": {
        const code = p.code ? await auth.consumeCode(p.code, client.id) : null;
        if (!code || code.redirectUri !== p.redirect_uri) {
          return oauthError(c, "invalid_grant", "The authorization code is invalid, expired or already used.");
        }
        if (code.codeChallenge) {
          if (!p.code_verifier || !safeEqual(pkceChallenge(p.code_verifier), code.codeChallenge)) {
            return oauthError(c, "invalid_grant", "The code verifier doesn't match.");
          }
        }
        const { token, createdAt } = await auth.createToken({ appId: client.id, accountId: code.accountId, scopes: code.scopes });
        return c.json(tokenResponse(token, code.scopes, createdAt));
      }

      case "password": {
        const scopes = parseScopes(p.scope);
        if (!scopes || !scopesAllowed(scopes, client.scopes)) {
          return oauthError(c, "invalid_scope", "The requested scope is invalid or not registered.");
        }
        const { account, error } = await login(p.username ?? "", p.password ?? "");
        if (!account) return oauthError(c, "invalid_grant", error);
        const { token, createdAt } = await auth.createToken({ appId: client.id, accountId: account.id, scopes });
        return c.json(tokenResponse(token, scopes, createdAt));
      }

      case "client_credentials": {
        const scopes = parseScopes(p.scope);
        if (!scopes || !scopesAllowed(scopes, client.scopes)) {
          return oauthError(c, "invalid_scope", "The requested scope is invalid or not registered.");
        }
        const { token, createdAt } = await auth.createToken({ appId: client.id, accountId: null, scopes });
        return c.json(tokenResponse(token, scopes, createdAt));
      }

      default:
        return oauthError(c, "unsupported_grant_type", "Use authorization_code, password or client_credentials.");
    }
  });

  app.post("/oauth/revoke", async (c) => {
    const p = await readParams(c);
    const creds = clientCredentials(c, p);
    const client = creds.id && creds.secret ? await auth.authenticateApp(creds.id, creds.secret) : null;
    if (!client) return oauthError(c, "invalid_client", "Client authentication failed.", 401);
    // RFC 7009: unknown tokens are not an error.
    if (p.token) await auth.revokeToken(p.token, client.id);
    return c.json({});
  });

  app.post("/api/v1/accounts", async (c) => {
    const result = requireToken(c, "write:accounts");
    if (!result.ok) return result.response;
    const token = result.value;
    if (token.account) return c.json({ error: "This method requires an app token, not a user token" }, 403);

    const p = await readParams(c);
    const username = (p.username ?? "").trim();
    const email = (p.email ?? "").trim();
    const password = p.password ?? "";
    const details: Record<string, { error: string; description: string }[]> = {};
    const fail = (field: string, error: string, description: string) => (details[field] ??= []).push({ error, description });

    if (!username) fail("username", "ERR_BLANK", "can't be blank");
    else if (username.length > USERNAME_MAX_LENGTH) fail("username", "ERR_TOO_LONG", `is too long (maximum is ${USERNAME_MAX_LENGTH} characters)`);
    else if (!isValidUsername(username)) fail("username", "ERR_INVALID", "must contain only letters, numbers and underscores");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("email", "ERR_INVALID", "is invalid");
    if (password.length < PASSWORD_MIN_LENGTH) fail("password", "ERR_TOO_SHORT", `is too short (minimum is ${PASSWORD_MIN_LENGTH} characters)`);
    if (password.length > PASSWORD_MAX_LENGTH) fail("password", "ERR_TOO_LONG", `is too long (maximum is ${PASSWORD_MAX_LENGTH} characters)`);
    if (!["true", "1", "on"].includes(p.agreement ?? "")) fail("agreement", "ERR_ACCEPTED", "must be accepted");

    let account: LocalAccount | null = null;
    if (!Object.keys(details).length) {
      try {
        account = await auth.registerUser({ username, email, password, locale: p.locale || null });
      } catch (error) {
        if (error instanceof UsernameTakenError) fail("username", "ERR_TAKEN", "is already taken");
        else if (error instanceof EmailTakenError) fail("email", "ERR_TAKEN", "is already taken");
        else throw error;
      }
    }
    if (!account) {
      const summary = Object.entries(details)
        .map(([field, errs]) => `${field[0]!.toUpperCase()}${field.slice(1)} ${errs[0]!.description}`)
        .join(", ");
      return c.json({ error: `Validation failed: ${summary}`, details }, 422);
    }

    await onRegistered?.(c, account, email);

    // Like Mastodon, the new user's token inherits the app token's scopes.
    const { token: userToken, createdAt } = await auth.createToken({
      appId: token.app.id,
      accountId: account.id,
      scopes: token.scopes,
    });
    return c.json(tokenResponse(userToken, token.scopes, createdAt));
  });

  app.get("/api/v1/accounts/verify_credentials", async (c) => {
    const result = requireUser(c, "read:accounts", "profile");
    if (!result.ok) return result.response;
    return c.json(await renderCredentialAccount(c, result.value.account));
  });

  return app;
}
