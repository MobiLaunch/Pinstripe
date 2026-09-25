/**
 * Turns what someone typed into the HTML that Mastodon clients and other
 * servers expect: escaped text in <p>s, with links, hashtags and mentions.
 * Nothing the author types is ever passed through as HTML.
 */

export interface RenderedContent {
  html: string;
  /** Lower-cased, deduplicated, without `#`. */
  tags: string[];
  /** Local accounts mentioned, by username as typed. */
  mentions: { username: string; href: string }[];
}

export interface RenderOptions {
  origin: string;
  domain: string;
  /** Profile URL for a local username, or null if there's no such account. */
  resolveLocal: (username: string) => Promise<string | null>;
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

// One pass over the raw text finds URLs, @mentions and #hashtags. Each must
// start the text or follow a character that can't be part of a word.
const TOKEN =
  /(?<url>https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]'])|(?<![\p{L}\p{N}_/@])@(?<user>[a-z0-9_](?:[a-z0-9_.-]*[a-z0-9_])?)(?:@(?<host>[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?))?|(?<![\p{L}\p{N}_&/#])#(?<tag>[\p{L}\p{N}_]*[\p{L}_][\p{L}\p{N}_]*)/giu;

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
        // Remote mentions need a WebFinger lookup; that arrives with inbound federation.
        const href = !host || host.toLowerCase() === localHost ? await options.resolveLocal(user) : null;
        if (href) {
          mentions.push({ username: user, href });
          out += `<span class="h-card"><a href="${escape(href)}" class="u-url mention">@<span>${escape(user)}</span></a></span>`;
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
