import { beforeEach, describe, expect, it } from "vitest";
import { testApp } from "../../test/app.ts";

const { reset, signedInUser, get, request } = testApp();
const api = "application/json";
const json = async (res: Response) => (await res.json()) as any;
const patch = (path: string, body: unknown, headers: Record<string, string>) =>
  request(path, { method: "PATCH", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

beforeEach(reset);

describe("update_credentials", () => {
  it("updates the profile and returns the credential account", async () => {
    const sam = await signedInUser("sam");
    const res = await patch(
      "/api/v1/accounts/update_credentials",
      {
        display_name: "Sam Avery",
        note: "Fixing things.\n\nFilming things. <b>hi</b>",
        locked: true,
        discoverable: false,
        fields_attributes: [{ name: "Website", value: "sam.example" }, { name: "", value: "" }],
        source: { privacy: "private" },
      },
      sam.headers,
    );
    expect(res.status).toBe(200);
    const me = await json(res);
    expect(me).toMatchObject({
      display_name: "Sam Avery",
      locked: true,
      discoverable: false,
      fields: [{ name: "Website", value: "sam.example", verified_at: null }],
      source: { privacy: "private", note: "Fixing things.\n\nFilming things. <b>hi</b>" },
    });
    // The bio is plain text, served as escaped HTML.
    expect(me.note).toBe("<p>Fixing things.</p><p>Filming things. &lt;b&gt;hi&lt;/b&gt;</p>");
    // New posts default to the chosen privacy.
    const post = await json(await request("/api/v1/statuses", { method: "POST", headers: { ...sam.headers, "content-type": "application/json" }, body: JSON.stringify({ status: "x" }) }));
    expect(post.visibility).toBe("private");
  });

  it("accepts Mastodon's form encoding", async () => {
    const sam = await signedInUser("sam");
    const form = new URLSearchParams({
      display_name: "Form Sam",
      "fields_attributes[0][name]": "Pronouns",
      "fields_attributes[0][value]": "they/them",
      "source[privacy]": "unlisted",
      bot: "true",
    });
    const me = await json(await request("/api/v1/accounts/update_credentials", { method: "PATCH", headers: sam.headers, body: form }));
    expect(me).toMatchObject({ display_name: "Form Sam", bot: true, fields: [{ name: "Pronouns", value: "they/them" }], source: { privacy: "unlisted" } });
  });

  it("validates lengths and counts", async () => {
    const sam = await signedInUser("sam");
    for (const body of [
      { display_name: "x".repeat(31) },
      { note: "x".repeat(501) },
      { fields_attributes: Array.from({ length: 5 }, (_, i) => ({ name: `f${i}`, value: "v" })) },
      { source: { privacy: "everyone" } },
    ]) {
      expect((await patch("/api/v1/accounts/update_credentials", body, sam.headers)).status).toBe(422);
    }
  });
});

describe("Pinstripe preferences", () => {
  it("reads and updates the settings Mastodon has no API for", async () => {
    const sam = await signedInUser("sam");
    expect(await json(await get("/api/v1/pinstripe/preferences", api, sam.headers))).toEqual({
      allow_video_downloads: false,
      hide_follower_counts: false,
      autoplay_videos: true,
      start_muted: false,
      save_data_on_cellular: true,
      theme: "blue",
    });
    const updated = await json(await patch("/api/v1/pinstripe/preferences", { hide_follower_counts: true, theme: "graphite" }, sam.headers));
    expect(updated).toMatchObject({ hide_follower_counts: true, theme: "graphite", autoplay_videos: true });
    expect((await json(await get(`/api/v1/accounts/${sam.account.id}`, api))).followers_count).toBe(0);
    expect((await patch("/api/v1/pinstripe/preferences", { theme: "neon" }, sam.headers)).status).toBe(422);
  });
});
