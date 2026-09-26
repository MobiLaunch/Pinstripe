import { beforeEach, describe, expect, it } from "vitest";
import { ORIGIN, testApp } from "../../test/app.ts";

const { reset, signedInUser, get, postJson, postForm, request, auth, mailer } = testApp();
const api = "application/json";
const json = async (res: Response) => (await res.json()) as any;

beforeEach(async () => {
  await reset();
  mailer.sent.length = 0;
});

/** Signs in with the password grant, as the app does. */
async function passwordLogin(username: string, password: string) {
  const { app: client, clientSecret } = await auth.createApp({ name: "t", website: null, redirectUris: ["urn:ietf:wg:oauth:2.0:oob"], scopes: ["read"] });
  const res = await postForm("/oauth/token", { grant_type: "password", username, password, client_id: client.clientId, client_secret: clientSecret, scope: "read" });
  return { status: res.status, body: await json(res) };
}

describe("changing the password", () => {
  it("needs the current password and signs out other sessions", async () => {
    const sam = await signedInUser("sam");
    const other = await passwordLogin("sam", "correct horse");
    expect(other.status).toBe(200);
    const otherHeaders = { authorization: `Bearer ${other.body.access_token}` };

    const wrong = await postJson("/api/v1/pinstripe/account/password", { current_password: "nope", password: "new battery staple" }, sam.headers);
    expect(wrong.status).toBe(422);
    const short = await postJson("/api/v1/pinstripe/account/password", { current_password: "correct horse", password: "short" }, sam.headers);
    expect(await json(short)).toMatchObject({ error: expect.stringContaining("too short") });

    const ok = await postJson("/api/v1/pinstripe/account/password", { current_password: "correct horse", password: "new battery staple" }, sam.headers);
    expect(ok.status).toBe(200);
    // This session stays; the other one is signed out.
    expect((await get("/api/v1/accounts/verify_credentials", api, sam.headers)).status).toBe(200);
    expect((await get("/api/v1/accounts/verify_credentials", api, otherHeaders)).status).toBe(401);
    expect((await passwordLogin("sam", "correct horse")).status).toBe(400);
    expect((await passwordLogin("sam", "new battery staple")).status).toBe(200);
    expect(mailer.sent.at(-1)).toMatchObject({ to: "sam@example.com", subject: "Your Pinstripe password was changed" });
  });
});

describe("email", () => {
  it("confirms addresses by link, and changes need the password", async () => {
    const sam = await signedInUser("sam");
    await signedInUser("mira");
    expect(await json(await get("/api/v1/pinstripe/account", api, sam.headers))).toEqual({ email: "sam@example.com", confirmed: false });

    expect((await postJson("/api/v1/pinstripe/account/email", { current_password: "nope", email: "s@new.example" }, sam.headers)).status).toBe(422);
    const taken = await postJson("/api/v1/pinstripe/account/email", { current_password: "correct horse", email: "MIRA@example.com" }, sam.headers);
    expect(await json(taken)).toMatchObject({ error: "That email address is already in use" });

    const changed = await postJson("/api/v1/pinstripe/account/email", { current_password: "correct horse", email: "sam@new.example" }, sam.headers);
    expect(await json(changed)).toEqual({ email: "sam@new.example", confirmed: false });
    // The old address is told.
    expect(mailer.sent.some((m) => m.to === "sam@example.com" && m.subject.includes("email was changed"))).toBe(true);

    const link = mailer.lastLink("sam@new.example")!;
    expect(link.startsWith(`${ORIGIN}/auth/confirmation?token=`)).toBe(true);
    const page = await request(new URL(link).pathname + new URL(link).search);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("confirmed");
    expect(await json(await get("/api/v1/pinstripe/account", api, sam.headers))).toEqual({ email: "sam@new.example", confirmed: true });
    // Links work once.
    expect((await request(new URL(link).pathname + new URL(link).search)).status).toBe(400);
  });

  it("sends a confirmation when someone signs up", async () => {
    const { app: client, clientSecret } = await auth.createApp({ name: "t", website: null, redirectUris: ["urn:ietf:wg:oauth:2.0:oob"], scopes: ["read", "write"] });
    const appToken = await json(
      await postForm("/oauth/token", { grant_type: "client_credentials", client_id: client.clientId, client_secret: clientSecret, scope: "write" }),
    );
    const res = await postJson(
      "/api/v1/accounts",
      { username: "newbie", email: "newbie@example.com", password: "correct horse", agreement: true },
      { authorization: `Bearer ${appToken.access_token}` },
    );
    expect(res.status).toBe(200);
    expect(mailer.lastLink("newbie@example.com")).toContain("/auth/confirmation?token=");
  });
});

describe("forgotten passwords", () => {
  it("emails a one-hour link to a page that sets a new password", async () => {
    await signedInUser("sam");
    // Unknown addresses get the same answer and no email.
    expect((await postJson("/api/v1/pinstripe/password_reset", { email: "nobody@example.com" })).status).toBe(200);
    expect(mailer.sent).toEqual([]);

    expect((await postJson("/api/v1/pinstripe/password_reset", { email: "SAM@example.com" })).status).toBe(200);
    const link = new URL(mailer.lastLink("sam@example.com")!);
    expect(link.pathname).toBe("/auth/password/edit");
    const form = await request(link.pathname + link.search);
    expect(form.status).toBe(200);
    expect(await form.text()).toContain('name="password"');

    const token = link.searchParams.get("token")!;
    const mismatch = await postForm("/auth/password", { token, password: "brand new pass", confirm: "different" });
    expect(mismatch.status).toBe(422);
    expect(await mismatch.text()).toContain("don&#39;t match");

    const done = await postForm("/auth/password", { token, password: "brand new pass", confirm: "brand new pass" });
    expect(done.status).toBe(200);
    expect((await passwordLogin("sam", "brand new pass")).status).toBe(200);
    expect((await passwordLogin("sam", "correct horse")).status).toBe(400);
    // Used up.
    expect((await request(link.pathname + link.search)).status).toBe(400);
  });

  it("limits how many emails one address gets", async () => {
    await signedInUser("sam");
    for (let i = 0; i < 8; i++) await postJson("/api/v1/pinstripe/password_reset", { email: "sam@example.com" });
    expect(mailer.sent.length).toBe(5);
  });
});
