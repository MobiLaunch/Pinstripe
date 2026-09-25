import { beforeEach, describe, expect, it } from "vitest";
import { testApp } from "../../test/app.ts";
import { pkceChallenge } from "./secrets.ts";

const { reset, get, postJson, postForm } = testApp();

const REDIRECT = "pinstripe://oauth";
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

async function registerApp(overrides: Record<string, unknown> = {}) {
  const res = await postJson("/api/v1/apps", {
    client_name: "Pinstripe",
    redirect_uris: [REDIRECT, "urn:ietf:wg:oauth:2.0:oob"],
    scopes: "read write follow push",
    website: "https://pinstripe.social",
    ...overrides,
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { id: string; client_id: string; client_secret: string; redirect_uris: string[] };
}

async function appToken(client: { client_id: string; client_secret: string }, scope = "read write follow push") {
  const res = await postForm("/oauth/token", { grant_type: "client_credentials", scope, ...pick(client) });
  expect(res.status).toBe(200);
  return ((await res.json()) as { access_token: string }).access_token;
}

const pick = (c: { client_id: string; client_secret: string }) => ({ client_id: c.client_id, client_secret: c.client_secret });

async function signUp(client: { client_id: string; client_secret: string }, fields: Record<string, unknown> = {}) {
  return postJson(
    "/api/v1/accounts",
    { username: "sam", email: "sam@example.com", password: "correct horse", agreement: true, locale: "en", ...fields },
    bearer(await appToken(client)),
  );
}

beforeEach(reset);

describe("app registration", () => {
  it("returns Mastodon's Application shape with credentials, shown once", async () => {
    const client = await registerApp();
    expect(client).toMatchObject({
      name: "Pinstripe",
      website: "https://pinstripe.social",
      redirect_uris: [REDIRECT, "urn:ietf:wg:oauth:2.0:oob"],
      redirect_uri: `${REDIRECT}\nurn:ietf:wg:oauth:2.0:oob`,
      scopes: ["read", "write", "follow", "push"],
      client_secret_expires_at: 0,
    });
    expect(client.client_id).toMatch(/^[\w-]{43}$/);
    const res = await get("/api/v1/apps/verify_credentials", "application/json", bearer(await appToken(client)));
    const body = await res.json();
    expect(body.name).toBe("Pinstripe");
    expect(body).not.toHaveProperty("client_secret");
  });

  it("accepts form bodies with newline-separated redirect URIs", async () => {
    const res = await postForm("/api/v1/apps", { client_name: "Form", redirect_uris: `${REDIRECT}\nhttps://a.example/cb` });
    expect((await res.json()).redirect_uris).toEqual([REDIRECT, "https://a.example/cb"]);
  });

  it("rejects bad input", async () => {
    for (const body of [
      { redirect_uris: REDIRECT },
      { client_name: "x", redirect_uris: "javascript:alert(1)" },
      { client_name: "x", redirect_uris: "not a uri" },
      { client_name: "x", redirect_uris: REDIRECT, scopes: "read admin:everything" },
    ]) {
      expect((await postJson("/api/v1/apps", body)).status).toBe(422);
    }
  });
});

describe("sign up", () => {
  it("creates an account and returns a user token", async () => {
    const client = await registerApp();
    const res = await signUp(client);
    expect(res.status).toBe(200);
    const token = await res.json();
    expect(token).toMatchObject({ token_type: "Bearer", scope: "read write follow push" });
    const me = await get("/api/v1/accounts/verify_credentials", "application/json", bearer(token.access_token));
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({
      username: "sam",
      acct: "sam",
      source: { privacy: "public", note: "", follow_requests_count: 0 },
    });
  });

  it("reports every invalid field in Mastodon's error shape", async () => {
    const client = await registerApp();
    const res = await signUp(client, { username: "bad name", email: "nope", password: "short", agreement: false });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/^Validation failed: /);
    expect(Object.keys(body.details).sort()).toEqual(["agreement", "email", "password", "username"]);
    expect(body.details.username[0].error).toBe("ERR_INVALID");
  });

  it("rejects taken usernames and emails, case-insensitively", async () => {
    const client = await registerApp();
    expect((await signUp(client)).status).toBe(200);
    const username = await (await signUp(client, { username: "SAM", email: "other@example.com" })).json();
    expect(username.details.username[0].error).toBe("ERR_TAKEN");
    const email = await (await signUp(client, { username: "sam2", email: "SAM@example.com" })).json();
    expect(email.details.email[0].error).toBe("ERR_TAKEN");
  });

  it("needs an app token with write:accounts", async () => {
    const client = await registerApp();
    const body = { username: "sam", email: "sam@example.com", password: "correct horse", agreement: true };
    expect((await postJson("/api/v1/accounts", body)).status).toBe(401);
    expect((await postJson("/api/v1/accounts", body, bearer("bogus"))).status).toBe(401);
    expect((await postJson("/api/v1/accounts", body, bearer(await appToken(client, "read")))).status).toBe(403);
    const user = (await (await signUp(client)).json()).access_token;
    expect((await postJson("/api/v1/accounts", { ...body, username: "x" }, bearer(user))).status).toBe(403);
  });
});

describe("password grant", () => {
  it("signs in with username or email", async () => {
    const client = await registerApp();
    await signUp(client);
    for (const username of ["sam", "@SAM", "Sam@Example.com"]) {
      const res = await postForm("/oauth/token", { grant_type: "password", username, password: "correct horse", scope: "read write", ...pick(client) });
      expect(res.status).toBe(200);
      expect((await res.json()).scope).toBe("read write");
    }
  });

  it("gives the same answer for a wrong password and an unknown user", async () => {
    const client = await registerApp();
    await signUp(client);
    const wrong = await postForm("/oauth/token", { grant_type: "password", username: "sam", password: "nope", ...pick(client) });
    const unknown = await postForm("/oauth/token", { grant_type: "password", username: "ghost", password: "nope", ...pick(client) });
    expect(wrong.status).toBe(400);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it("locks a login out after repeated failures, even with the right password", async () => {
    const client = await registerApp();
    await signUp(client);
    const attempt = (password: string) =>
      postForm("/oauth/token", { grant_type: "password", username: "sam", password, ...pick(client) });
    for (let i = 0; i < 3; i++) expect((await attempt("wrong")).status).toBe(400);
    const res = await attempt("correct horse");
    expect(res.status).toBe(400);
    expect((await res.json()).error_description).toMatch(/Too many failed attempts/);
  });

  it("refuses scopes the app didn't register and bad client secrets", async () => {
    const client = await registerApp({ scopes: "read" });
    const base = { grant_type: "password", username: "sam", password: "correct horse" };
    expect((await postForm("/oauth/token", { ...base, scope: "write", ...pick(client) })).status).toBe(400);
    expect((await postForm("/oauth/token", { ...base, client_id: client.client_id, client_secret: "wrong" })).status).toBe(401);
  });
});

describe("authorization code flow", () => {
  async function setup() {
    const client = await registerApp();
    await signUp(client);
    const verifier = "a-very-long-random-code-verifier-string-0123456789";
    const params = {
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      scope: "read write",
      state: "xyz",
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: "S256",
    };
    return { client, verifier, params };
  }

  const authorize = (params: Record<string, string>, extra: Record<string, string>) =>
    postForm("/oauth/authorize", { ...params, ...extra });

  it("shows a sign-in page naming the app and what it can do", async () => {
    const { params } = await setup();
    const res = await get(`/oauth/authorize?${new URLSearchParams(params)}`, "text/html");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    const html = await res.text();
    expect(html).toContain("<strong>Pinstripe</strong> wants to use your Pinstripe account");
    expect(html).toContain("Post, favourite, boost");
  });

  it("never redirects to an unregistered redirect URI", async () => {
    const { params } = await setup();
    const res = await get(`/oauth/authorize?${new URLSearchParams({ ...params, redirect_uri: "https://evil.example/cb" })}`, "text/html");
    expect(res.status).toBe(400);
    const post = await authorize({ ...params, redirect_uri: "https://evil.example/cb" }, { login: "sam", password: "correct horse", decision: "allow" });
    expect(post.status).toBe(400);
    expect(post.headers.get("location")).toBeNull();
  });

  it("issues a single-use code that needs the PKCE verifier", async () => {
    const { client, verifier, params } = await setup();
    const res = await authorize(params, { login: "sam", password: "correct horse", decision: "allow" });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location")!);
    expect(`${location.protocol}//${location.host}`).toBe(REDIRECT);
    expect(location.searchParams.get("state")).toBe("xyz");
    const code = location.searchParams.get("code")!;

    const exchange = (v: string) =>
      postForm("/oauth/token", { grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: v, ...pick(client) });

    const bad = await exchange("wrong-verifier");
    expect(bad.status).toBe(400);
    // A failed exchange still burns the code: codes are strictly single-use.
    expect((await exchange(verifier)).status).toBe(400);

    const again = await authorize(params, { login: "sam", password: "correct horse", decision: "allow" });
    const code2 = new URL(again.headers.get("location")!).searchParams.get("code")!;
    const ok = await postForm("/oauth/token", { grant_type: "authorization_code", code: code2, redirect_uri: REDIRECT, code_verifier: verifier, ...pick(client) });
    expect(ok.status).toBe(200);
    const token = await ok.json();
    expect(token.scope).toBe("read write");
    expect((await get("/api/v1/accounts/verify_credentials", "application/json", bearer(token.access_token))).status).toBe(200);
  });

  it("accepts client credentials over HTTP Basic", async () => {
    const { client, verifier, params } = await setup();
    const res = await authorize(params, { login: "sam", password: "correct horse", decision: "allow" });
    const code = new URL(res.headers.get("location")!).searchParams.get("code")!;
    const basic = Buffer.from(`${client.client_id}:${client.client_secret}`).toString("base64");
    const ok = await postForm(
      "/oauth/token",
      { grant_type: "authorization_code", code, redirect_uri: REDIRECT, code_verifier: verifier },
      { authorization: `Basic ${basic}` },
    );
    expect(ok.status).toBe(200);
  });

  it("re-shows the form on a wrong password and redirects with access_denied on deny", async () => {
    const { params } = await setup();
    const wrong = await authorize(params, { login: "sam", password: "nope", decision: "allow" });
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toContain("username or password isn&#39;t right");
    const deny = await authorize(params, { decision: "deny" });
    const location = new URL(deny.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("xyz");
  });

  it("shows the code on a page for out-of-band clients", async () => {
    const { params } = await setup();
    const res = await authorize({ ...params, redirect_uri: "urn:ietf:wg:oauth:2.0:oob" }, { login: "sam", password: "correct horse", decision: "allow" });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Copy this code");
  });

  it("escapes everything it echoes back", async () => {
    const client = await registerApp({ client_name: '<script>alert("x")</script>' });
    const res = await get(`/oauth/authorize?${new URLSearchParams({ client_id: client.client_id, redirect_uri: REDIRECT, state: '"><img>' })}`, "text/html");
    const html = await res.text();
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain('"><img>');
  });
});

describe("tokens", () => {
  it("can be revoked by their app", async () => {
    const client = await registerApp();
    const token = (await (await signUp(client)).json()).access_token;
    const other = await registerApp();
    await postForm("/oauth/revoke", { token, ...pick(other) });
    expect((await get("/api/v1/accounts/verify_credentials", "application/json", bearer(token))).status).toBe(200);
    expect((await postForm("/oauth/revoke", { token, ...pick(client) })).status).toBe(200);
    expect((await get("/api/v1/accounts/verify_credentials", "application/json", bearer(token))).status).toBe(401);
  });

  it("only reach what their scopes allow", async () => {
    const client = await registerApp();
    await signUp(client);
    const writeOnly = await postForm("/oauth/token", { grant_type: "password", username: "sam", password: "correct horse", scope: "write", ...pick(client) });
    const token = (await writeOnly.json()).access_token;
    expect((await get("/api/v1/accounts/verify_credentials", "application/json", bearer(token))).status).toBe(403);
    const appOnly = await appToken(client);
    expect((await get("/api/v1/accounts/verify_credentials", "application/json", bearer(appOnly))).status).toBe(422);
  });

  it("advertises the OAuth server", async () => {
    const meta = await (await get("/.well-known/oauth-authorization-server", "application/json")).json();
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
    expect(meta.token_endpoint).toBe("https://pinstripe.test/oauth/token");
  });
});

describe("CORS", () => {
  const { request } = testApp();
  it("lets browser clients call the API but not frame the sign-in page", async () => {
    const preflight = await request("/oauth/token", {
      method: "OPTIONS",
      headers: { origin: "http://localhost:8081", "access-control-request-method": "POST" },
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    const page = await request("/oauth/authorize", { headers: { origin: "http://localhost:8081" } });
    expect(page.headers.get("access-control-allow-origin")).toBeNull();
  });
});
