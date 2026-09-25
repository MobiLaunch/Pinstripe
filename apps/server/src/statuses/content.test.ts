import { describe, expect, it } from "vitest";
import { renderContent } from "./content.ts";

const options = {
  origin: "https://pinstripe.test",
  domain: "pinstripe.test",
  resolveMention: async (u: string, domain: string | null) => {
    if (domain === null && u.toLowerCase() === "sam") return { href: "https://pinstripe.test/@sam", accountId: "sam-id" };
    if (domain === "tilde.zone" && u === "mira") return { href: "https://tilde.zone/@mira", accountId: "mira-id" };
    return null;
  },
};
const render = (text: string) => renderContent(text, options);

describe("renderContent", () => {
  it("escapes everything the author typed", async () => {
    const { html } = await render(`<script>alert("hi")</script> & 'quotes'`);
    expect(html).toBe("<p>&lt;script&gt;alert(&quot;hi&quot;)&lt;/script&gt; &amp; &#39;quotes&#39;</p>");
  });

  it("makes paragraphs and line breaks", async () => {
    expect((await render("one\ntwo\n\n\nthree\r\n")).html).toBe("<p>one<br>two</p><p>three</p>");
  });

  it("links URLs without swallowing trailing punctuation", async () => {
    const { html } = await render("see https://example.com/a?b=1&c=2.");
    expect(html).toBe(
      '<p>see <a href="https://example.com/a?b=1&amp;c=2" rel="nofollow noopener noreferrer" target="_blank">example.com/a?b=1&amp;c=2</a>.</p>',
    );
  });

  it("links hashtags and collects them once, lower-cased", async () => {
    const { html, tags } = await render("#RetroComputing and #repair, #retrocomputing again. Not a#tag or #123");
    expect(tags).toEqual(["retrocomputing", "repair"]);
    expect(html).toContain('<a href="https://pinstripe.test/tags/retrocomputing" class="mention hashtag" rel="tag">#<span>RetroComputing</span></a>');
    expect(html).toContain("Not a#tag or #123");
  });

  it("handles non-Latin hashtags", async () => {
    expect((await render("#日本語 #café")).tags).toEqual(["日本語", "café"]);
  });

  it("links local and remote mentions and leaves unknown ones as text", async () => {
    const { html, mentions } = await render("hi @sam, @Sam@pinstripe.test, @ghost, @mira@tilde.zone and @nobody@tilde.zone. email@sam.example");
    expect(mentions.map((m) => [m.username, m.accountId])).toEqual([
      ["sam", "sam-id"],
      ["Sam", "sam-id"],
      ["mira", "mira-id"],
    ]);
    expect(html).toContain('<a href="https://pinstripe.test/@sam" class="u-url mention">@<span>sam</span></a>');
    expect(html).toContain('<a href="https://tilde.zone/@mira" class="u-url mention">@<span>mira</span></a>');
    expect(html).toContain("@ghost,");
    expect(html).toContain("and @nobody@tilde.zone. email@sam.example");
  });

  it("returns nothing for blank input", async () => {
    expect(await render("  \n\n ")).toEqual({ html: "", tags: [], mentions: [] });
  });
});
