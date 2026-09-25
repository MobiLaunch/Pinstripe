import { beforeEach, describe, expect, it } from "vitest";
import { testApp } from "../../test/app.ts";

const closed = testApp({ registrationsOpen: false });
const json = async (res: Response) => (await res.json()) as any;
beforeEach(closed.reset);

describe("closed registrations", () => {
  it("turns sign-up away and says so", async () => {
    const { app: client, clientSecret } = await closed.auth.createApp({ name: "t", website: null, redirectUris: ["urn:ietf:wg:oauth:2.0:oob"], scopes: ["write"] });
    const token = (await json(await closed.postForm("/oauth/token", { grant_type: "client_credentials", client_id: client.clientId, client_secret: clientSecret, scope: "write" }))).access_token;
    const res = await closed.postJson("/api/v1/accounts", { username: "sam", email: "sam@example.com", password: "correct horse", agreement: true }, { authorization: `Bearer ${token}` });
    expect(res.status).toBe(403);
    expect((await json(await closed.get("/api/v2/instance", "application/json"))).registrations.enabled).toBe(false);
  });
});
