/**
 * Profile link verification (the green check): a profile field whose value
 * is a web page that links back to the profile with `rel="me"` is marked
 * verified, as on Mastodon.
 *
 * The pages are other people's, so fetching is careful: public addresses
 * only (unless the server allows private ones, for development), redirects
 * followed by hand and re-checked, 5 seconds and 1 MB at most.
 */
import { validatePublicUrl } from "@fedify/vocab-runtime";
import { Parser } from "htmlparser2";
import type { LocalAccount, Store } from "../store.ts";

const TIMEOUT_MS = 5000;
const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;

/** The `rel="me"` links on a page, resolved against its URL. */
export function relMeLinks(html: string, base: string): string[] {
  const links: string[] = [];
  const parser = new Parser({
    onopentag(name, attrs) {
      if ((name !== "a" && name !== "link") || !attrs.href) return;
      if (!(attrs.rel ?? "").toLowerCase().split(/\s+/).includes("me")) return;
      try {
        links.push(new URL(attrs.href, base).href);
      } catch {
        // Not a URL.
      }
    },
  });
  parser.write(html);
  parser.end();
  return links;
}

const normalize = (url: string) => url.replace(/\/+$/, "").toLowerCase();

export class LinkVerifier {
  #pending = new Set<Promise<void>>();

  constructor(
    private readonly store: Store,
    private readonly options: { allowPrivateAddress?: boolean; fetch?: typeof fetch } = {},
  ) {}

  /**
   * Checks the account's link fields in the background and saves which are
   * verified. `profileUrls` are the addresses a page may link back to.
   */
  verifyLater(account: LocalAccount, profileUrls: string[]) {
    const run = this.#verify(account, profileUrls)
      .catch((error) => console.error("Link verification failed", error))
      .finally(() => this.#pending.delete(run));
    this.#pending.add(run);
  }

  /** Tests: waits for checks in progress. */
  async idle() {
    while (this.#pending.size) await Promise.all(this.#pending);
  }

  async #verify(account: LocalAccount, profileUrls: string[]) {
    const wanted = new Set(profileUrls.map(normalize));
    const results = new Map<string, boolean>();
    for (const field of account.fields) {
      if (!/^https?:\/\//i.test(field.value) || results.has(field.value)) continue;
      const html = await this.#fetchPage(field.value).catch(() => null);
      results.set(field.value, !!html && relMeLinks(html.text, html.url).some((l) => wanted.has(normalize(l))));
    }
    if (![...results.values()].some(Boolean) && !account.fields.some((f) => f.verifiedAt)) return;

    // Save against the latest fields: they may have been edited meanwhile.
    const latest = await this.store.getLocalAccount(account.id);
    if (!latest) return;
    const now = new Date().toISOString();
    const fields = latest.fields.map((f) =>
      results.has(f.value) ? { ...f, verifiedAt: results.get(f.value) ? (f.verifiedAt ?? now) : null } : f,
    );
    if (JSON.stringify(fields) !== JSON.stringify(latest.fields)) await this.store.updateAccount(account.id, { fields });
  }

  async #fetchPage(start: string): Promise<{ url: string; text: string } | null> {
    const doFetch = this.options.fetch ?? fetch;
    let url = start;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      if (!this.options.allowPrivateAddress) await validatePublicUrl(url);
      const res = await doFetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: "text/html", "user-agent": "Pinstripe (link verification)" },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location")!, url).href;
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html") || !res.body) return null;
      return { url, text: await readCapped(res.body, MAX_BYTES) };
    }
    return null;
  }
}

/** Reads a body up to `max` bytes; a longer page is cut off (links are usually in the head). */
async function readCapped(body: ReadableStream<Uint8Array>, max: number): Promise<string> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks).subarray(0, max));
}
