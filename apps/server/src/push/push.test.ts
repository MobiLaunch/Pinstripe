import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { testApp } from "../../test/app.ts";
import { NotificationStore } from "../notifications/store.ts";
import { PushService } from "./service.ts";

const { reset, signedInUser, postJson, request, db } = testApp();
const json = async (res: Response) => (await res.json()) as any;

// Stands in for Expo's push service.
const sent: any[][] = [];
let answer: (messages: any[]) => unknown = (messages) => ({ data: messages.map(() => ({ status: "ok", id: "x" })) });
const fakeFetch = (async (_url: string, init: RequestInit) => {
  const messages = JSON.parse(String(init.body));
  sent.push(messages);
  return new Response(JSON.stringify(answer(messages)), { headers: { "content-type": "application/json" } });
}) as typeof fetch;
const push = new PushService(db, new NotificationStore(db), { fetch: fakeFetch, delayMs: 0 }).start();
afterAll(() => push.stop());

beforeEach(async () => {
  await reset();
  sent.length = 0;
  answer = (messages) => ({ data: messages.map(() => ({ status: "ok", id: "x" })) });
});

const TOKEN = "ExponentPushToken[abc123]";
const register = (headers: Record<string, string>, token = TOKEN) => postJson("/api/v1/pinstripe/push", { expo_token: token, platform: "ios" }, headers);

describe("push notifications", () => {
  it("sends new notifications to registered phones", async () => {
    const sam = await signedInUser("sam", ["read", "write", "follow", "push"]);
    const mira = await signedInUser("mira");
    expect((await register(sam.headers)).status).toBe(200);
    expect((await register(sam.headers, "not a token")).status).toBe(422);

    const post = await json(await postJson("/api/v1/statuses", { status: "<b>hello</b> world" }, sam.headers));
    await postJson(`/api/v1/statuses/${post.id}/favourite`, {}, mira.headers);
    await push.idle();
    await postJson("/api/v1/statuses", { status: "nice one", in_reply_to_id: post.id }, mira.headers);
    await push.idle();

    expect(sent.flat()).toEqual([
      expect.objectContaining({ to: TOKEN, title: "mira liked your post", body: "<b>hello</b> world", badge: 1 }),
      expect.objectContaining({ to: TOKEN, title: "mira replied to you", body: "nice one", badge: 2 }),
    ]);
    expect(sent[0]![0].data).toMatchObject({ type: "favourite", statusId: post.id, accountId: mira.account.id });
  });

  it("stops after signing out, unregistering, a mute, or when Expo says the phone is gone", async () => {
    const sam = await signedInUser("sam", ["read", "write", "follow", "push"]);
    const mira = await signedInUser("mira");
    const kai = await signedInUser("kai");
    await register(sam.headers);
    const post = await json(await postJson("/api/v1/statuses", { status: "hi" }, sam.headers));

    // Muted (with notifications): nothing.
    await postJson(`/api/v1/accounts/${kai.account.id}/mute`, {}, sam.headers);
    await postJson(`/api/v1/statuses/${post.id}/favourite`, {}, kai.headers);
    await push.idle();
    expect(sent).toEqual([]);

    // Expo says the token is dead: it's removed, so the next one isn't sent.
    answer = () => ({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] });
    await postJson(`/api/v1/statuses/${post.id}/favourite`, {}, mira.headers);
    await push.idle();
    expect(sent).toHaveLength(1);
    await postJson(`/api/v1/statuses/${post.id}/reblog`, {}, mira.headers);
    await push.idle();
    expect(sent).toHaveLength(1);

    // Registered again, then unregistered: nothing.
    await register(sam.headers);
    await request("/api/v1/pinstripe/push", { method: "DELETE", headers: { ...sam.headers, "content-type": "application/json" }, body: JSON.stringify({ expo_token: TOKEN }) });
    await postJson(`/api/v1/accounts/${sam.account.id}/follow`, {}, mira.headers);
    await push.idle();
    expect(sent).toHaveLength(1);

    // Registered, then signed out (token revoked): nothing.
    await register(sam.headers);
    await db.execute(`update oauth_tokens set revoked_at = now() where account_id = '${sam.account.id}'` as any);
    await postJson(`/api/v1/accounts/${sam.account.id}/unfollow`, {}, mira.headers);
    await postJson(`/api/v1/accounts/${sam.account.id}/follow`, {}, mira.headers);
    await push.idle();
    expect(sent).toHaveLength(1);
  });

  it("needs the push scope", async () => {
    const sam = await signedInUser("sam", ["read", "write"]);
    expect((await register(sam.headers)).status).toBe(403);
  });
});
