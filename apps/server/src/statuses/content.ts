/**
 * Turns what someone typed into the HTML that Mastodon clients and other
 * servers expect: escaped text in <p>s, with links, hashtags and mentions.
 * Nothing the author types is ever passed through as HTML.
 */

export interface RenderedContent {
  html: string;
  /** Lower-cased, deduplicated, without `#`. */
  tags: string[];
  /** Accounts mentioned, as typed, with their profile URL and account id. */
  mentions: { username: string; href: string; accountId: string }[];
}

export interface RenderOptions {
  origin: string;
  /** This server's host; `@user@thishost` is a local mention. */
  domain: string;
  /** Finds a mentioned account: `domain` null for local. Null if there's no such account. */
  resolveMention: (username: string, domain: string | null) => Promise<{ href: string; accountId: string } | null>;
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

// One pass over the raw text finds URLs, @mentions and #hashtags. Each must
// start the text or follow a character that can't be part of a word.
const TOKEN =
  /(?<url>https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])|(?<![\p{L}\p{N}_/@])@(?<user>[a-z0-9_](?:[a-z0-9_.-]*[a-z0-9_])?)(?:@(?<host>(?:[a-z0-9-]+\.)+[a-z0-9-]*[a-z][a-z0-9-]*(?::\d+)?|localhost(?::\d+)?|\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?))?|(?<![\p{L}\p{N}_&/#])#(?<tag>[\p{L}\p{N}_]*[\p{L}_][\p{L}\p{N}_]*)/giu;

export async function renderContent(text: string, options: RenderOptions): Promise<RenderedContent> {
  const tags = new Set<string>();
  const mentions: RenderedContent["mentions"] = [];
  const localHost = options.domain.toLowerCase();

  async function renderLine(line: string): Promise<string> {
    let out = "";
    let last = 0;
    for (const m of line.matchAll(TOKEN)) {
      const { url, user, host, tag } = m.groups!;
      out += escape(line.slice(last, m.index));
      last = m.index! + m[0].length;
      if (url) {
        const display = url.replace(/^https?:\/\//, "");
        out += `<a href="${escape(url)}" rel="nofollow noopener noreferrer" target="_blank">${escape(display)}</a>`;
      } else if (user) {
        const remote = host && host.toLowerCase() !== localHost ? host.toLowerCase() : null;
        const found = await options.resolveMention(user, remote);
        if (found) {
          mentions.push({ username: user, href: found.href, accountId: found.accountId });
          out += `<span class="h-card"><a href="${escape(found.href)}" class="u-url mention">@<span>${escape(user)}</span></a></span>`;
        } else {
          out += escape(m[0]);
        }
      } else if (tag) {
        tags.add(tag.toLowerCase());
        const href = `${options.origin}/tags/${encodeURIComponent(tag.toLowerCase())}`;
        out += `<a href="${escape(href)}" class="mention hashtag" rel="tag">#<span>${escape(tag)}</span></a>`;
      }
    }
    return out + escape(line.slice(last));
  }

  const paragraphs = text
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/)
    .filter((p) => p.trim());
  const html: string[] = [];
  for (const p of paragraphs) {
    const lines = await Promise.all(p.split("\n").map(renderLine));
    html.push(`<p>${lines.join("<br>")}</p>`);
  }
  return { html: html.join(""), tags: [...tags], mentions };
}
