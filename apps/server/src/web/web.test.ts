import { beforeEach, describe, expect, it } from "vitest";
import { ORIGIN, testApp } from "../../test/app.ts";

const { reset, signedInUser, postJson, request, store } = testApp();
const html = (path: string, accept = "text/html") => request(path, { headers: { accept } });
const json = async (res: Response) => (await res.json()) as any;

beforeEach(reset);

describe("public web pages", () => {
  it("shows a profile with its public posts and rel=me links", async () => {
    const sam = await signedInUser("sam");
    await store.updateAccount(sam.account.id, {
      displayName: "Sam <Avery>",
      bio: "Fixing things.",
      fields: [{ name: "Site", value: "https://sam.example", verifiedAt: null }],
    });
    await postJson("/api/v1/statuses", { status: "Public hello #intro" }, sam.headers);
    await postJson("/api/v1/statuses", { status: "Followers only", visibility: "private" }, sam.headers);

    const res = await html("/@sam");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
    const body = await res.text();
    expect(body).toContain("Sam &lt;Avery&gt;");
    expect(body).toContain("@sam@pinstripe.test");
    expect(body).toContain("Public hello");
    expect(body).not.toContain("Followers only");
    expect(body).toContain('rel="me nofollow noopener"');
    expect(body).toContain(`href="${ORIGIN}/users/${sam.account.id}"`);
  });

  it("sends ActivityPub clients to the actor and the note", async () => {
    const sam = await signedInUser("sam");
    const post = await json(await postJson("/api/v1/statuses", { status: "hi" }, sam.headers));
    const actor = await html("/@sam", "application/activity+json");
    expect(actor.status).toBe(302);
    expect(actor.headers.get("location")).toBe(`${ORIGIN}/users/${sam.account.id}`);
    const note = await html(`/@sam/${post.id}`, "application/activity+json");
    expect(note.headers.get("location")).toBe(post.uri);
    // And browsers on ActivityPub URLs to the pages.
    expect((await html(`/users/${sam.account.id}`)).headers.get("location")).toBe("/@sam");
  });

  it("shows a public post with its replies and preview tags, and hides the rest", async () => {
    const sam = await signedInUser("sam");
    const mira = await signedInUser("mira");
    const post = await json(await postJson("/api/v1/statuses", { status: "Look at this" }, sam.headers));
    await postJson("/api/v1/statuses", { status: "Nice!", in_reply_to_id: post.id }, mira.headers);
    const secret = await json(await postJson("/api/v1/statuses", { status: "secret", visibility: "private" }, sam.headers));

    const body = await (await html(`/@sam/${post.id}`)).text();
    expect(body).toContain('<meta property="og:description" content="Look at this">');
    expect(body).toContain("Nice!");
    expect((await html(`/@sam/${secret.id}`)).status).toBe(404);
    // A post under someone else's name isn't found.
    expect((await html(`/@mira/${post.id}`)).status).toBe(404);
    expect((await html("/@nobody")).status).toBe(404);
  });

  it("lists a hashtag and the server's latest posts", async () => {
    const sam = await signedInUser("sam");
    await postJson("/api/v1/statuses", { status: "Tagged #Aqua" }, sam.headers);
    expect(await (await html("/tags/aqua")).text()).toContain("Tagged");
    expect(await (await html("/")).text()).toContain("Tagged");
  });

  it("says when an account is suspended", async () => {
    const sam = await signedInUser("sam");
    await store.db.execute(`update accounts set suspended_at = now() where id = '${sam.account.id}'` as any);
    const res = await html("/@sam");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("suspended");
  });
});
