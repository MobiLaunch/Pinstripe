import { beforeEach, describe, expect, it } from "vitest";
import { testApp } from "../../test/app.ts";

/** Separate files, since the setting is per server. */
const open = testApp();
const json = async (res: Response) => (await res.json()) as any;

async function appToken(t: ReturnType<typeof testApp>) {
  const { app: client, clientSecret } = await t.auth.createApp({ name: "t", website: null, redirectUris: ["urn:ietf:wg:oauth:2.0:oob"], scopes: ["read", "write"] });
  const res = await t.postForm("/oauth/token", { grant_type: "client_credentials", client_id: client.clientId, client_secret: clientSecret, scope: "write" });
  return (await json(res)).access_token as string;
}

const signUp = (t: ReturnType<typeof testApp>, token: string, username: string, headers: Record<string, string> = {}) =>
  t.postJson(
    "/api/v1/accounts",
    { username, email: `${username}@example.com`, password: "correct horse", agreement: true },
    { authorization: `Bearer ${token}`, ...headers },
  );

beforeEach(open.reset);

describe("sign-up limits", () => {
  it("allows a few sign-ups per address per hour", async () => {
    const token = await appToken(open);
    for (let i = 0; i < 5; i++) expect((await signUp(open, token, `user${i}`)).status).toBe(200);
    const res = await signUp(open, token, "user5");
    expect(res.status).toBe(429);
    expect(await json(res)).toMatchObject({ error: expect.stringContaining("Too many sign-ups") });
  });

  it("describes the server to Mastodon clients", async () => {
    const v2 = await json(await open.get("/api/v2/instance", "application/json"));
    expect(v2).toMatchObject({
      domain: "pinstripe.test",
      registrations: { enabled: true },
      configuration: { statuses: { max_characters: 500 }, media_attachments: { video_size_limit: 200 * 1024 * 1024 } },
    });
    expect(v2.version).toMatch(/^4\.3\.0 \(compatible; Pinstripe/);
    expect(await json(await open.get("/api/v1/instance", "application/json"))).toMatchObject({ uri: "pinstripe.test", registrations: true });
  });
});
