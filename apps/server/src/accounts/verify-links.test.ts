import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ORIGIN, testApp } from "../../test/app.ts";
import { LinkVerifier, relMeLinks } from "./verify-links.ts";

const { reset, signedInUser, get, request, linkVerifier, store } = testApp();
const api = "application/json";
const json = async (res: Response) => (await res.json()) as any;

// Somebody's website, which may or may not link back.
const pages: Record<string, { status?: number; type?: string; body?: string; location?: string }> = {};
const site = createServer((req, res) => {
  const page = pages[req.url ?? ""] ?? { status: 404 };
  res.writeHead(page.status ?? 200, { "content-type": page.type ?? "text/html", ...(page.location ? { location: page.location } : {}) });
  res.end(page.body ?? "");
});
let base = "";
beforeAll(async () => {
  await new Promise<void>((r) => site.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(site.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => site.close(() => r())));
beforeEach(reset);

async function setFields(headers: Record<string, string>, fields: { name: string; value: string }[]) {
  await request("/api/v1/accounts/update_credentials", {
    method: "PATCH",
    headers: { ...headers, "content-type": api },
    body: JSON.stringify({ fields_attributes: fields }),
  });
  await linkVerifier.idle();
  return (await json(await get("/api/v1/accounts/verify_credentials", api, headers))).fields as { name: string; value: string; verified_at: string | null }[];
}

describe("rel=me verification", () => {
  it("finds rel=me links in anchors and link tags", () => {
    const html = `<html><head><link rel="me authn" href="https://a.example/@x"></head>
      <body><a href="/me" rel="noopener me">me</a><a href="https://b.example" rel="nofollow">no</a></body></html>`;
    expect(relMeLinks(html, "https://site.example/about")).toEqual(["https://a.example/@x", "https://site.example/me"]);
  });

  it("verifies pages that link back to the profile, and only those", async () => {
    const sam = await signedInUser("sam");
    pages["/good"] = { body: `<a rel="me" href="${ORIGIN}/@sam">Me on Pinstripe</a>` };
    pages["/redirect"] = { status: 302, location: "/good" };
    pages["/other"] = { body: `<a rel="me" href="${ORIGIN}/@mira">Not Sam</a>` };
    pages["/text"] = { type: "text/plain", body: `<a rel="me" href="${ORIGIN}/@sam">` };

    const fields = await setFields(sam.headers, [
      { name: "Site", value: `${base}/good` },
      { name: "Moved", value: `${base}/redirect` },
      { name: "Wrong", value: `${base}/other` },
      { name: "Plain", value: `${base}/text` },
    ]);
    expect(fields.map((f) => [f.name, !!f.verified_at])).toEqual([
      ["Site", true],
      ["Moved", true],
      ["Wrong", false],
      ["Plain", false],
    ]);

    // A page that stops linking back loses the check when the fields are next checked.
    const first = fields[0]!.verified_at;
    pages["/good"] = { body: "gone" };
    pages["/blog"] = { body: `<link rel="me" href="${ORIGIN}/@sam/">` };
    const again = await setFields(sam.headers, [
      { name: "Site", value: `${base}/good` },
      { name: "Blog", value: `${base}/blog` },
    ]);
    expect(again.map((f) => f.verified_at)).toEqual([null, again[1]!.verified_at]);
    expect(again[1]!.verified_at).not.toBeNull();
    expect(first).not.toBeNull();
  });

  it("won't fetch private addresses unless allowed", async () => {
    const sam = await signedInUser("sam");
    pages["/good"] = { body: `<a rel="me" href="${ORIGIN}/@sam">me</a>` };
    const account = await store.updateAccount(sam.account.id, { fields: [{ name: "Site", value: `${base}/good`, verifiedAt: null }] });
    const strict = new LinkVerifier(store);
    strict.verifyLater(account as any, [`${ORIGIN}/@sam`]);
    await strict.idle();
    expect((await store.getAccount(sam.account.id))!.fields[0]!.verifiedAt).toBeNull();
  });
});
