import sanitizeHtml from "sanitize-html";

/**
 * HTML from other servers is untrusted. Keep only what Mastodon keeps:
 * paragraphs, line breaks, links and the spans used for mentions and
 * hashtags. Every link opens safely in a new tab.
 */
export function sanitizeRemoteHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "a", "span", "del", "pre", "code", "em", "strong", "b", "i", "u", "ul", "ol", "li", "blockquote"],
    allowedAttributes: {
      a: ["href", "rel", "class", "translate"],
      span: ["class", "translate"],
      ol: ["start", "reversed"],
      li: ["value"],
    },
    allowedClasses: {
      a: ["mention", "hashtag", "u-url", "status-link", "unhandled-link"],
      span: ["h-card", "invisible", "ellipsis", "mention", "hashtag"],
    },
    allowedSchemes: ["http", "https", "dat", "dweb", "ipfs", "ipns", "ssb", "gopher", "xmpp", "magnet", "gemini"],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, rel: "nofollow noopener noreferrer", target: "_blank" },
      }),
    },
  });
}

/** Plain text from HTML: for names and other places that don't render markup. */
export function htmlToPlain(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/&amp;/g, "&").trim();
}
