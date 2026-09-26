/**
 * Public web pages for people who follow a link from elsewhere in the
 * fediverse: a profile (`/@user`), a post (`/@user/:id`) and a hashtag
 * (`/tags/:name`). Server-rendered HTML in the app's Aqua style, no
 * scripts. Built from the same Mastodon JSON the API returns, so what's
 * visible here is exactly what's visible to a signed-out client.
 */
import type { MastodonAccount, MastodonStatus } from "../mastodon.ts";
import type { MastodonMedia } from "../media/serialize.ts";

export const escape = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const STYLE = `
*{box-sizing:border-box}
body{margin:0;font-family:"Lucida Grande","Lucida Sans Unicode",Geneva,Verdana,sans-serif;color:#1a1a1a;font-size:15px;line-height:1.45;
  background-color:#ececec;background-image:repeating-linear-gradient(180deg,#f4f4f4 0 2px,#e3e3e3 2px 4px)}
a{color:#1558b8}
header.bar{position:sticky;top:0;z-index:1;display:flex;align-items:center;justify-content:space-between;padding:10px 16px;
  background:linear-gradient(180deg,#f7f7f7 0%,#dedede 48%,#cbcbcb 52%,#bababa 100%);border-bottom:1px solid #8e8e8e}
header.bar a.brand{font-weight:bold;font-size:18px;color:#0e4fae;text-decoration:none}
main{max-width:640px;margin:0 auto;padding:0 12px 40px}
.banner{height:160px;background:linear-gradient(180deg,#9ad5ff,#3f8fe6 60%,#1d5bbb) center/cover;border-bottom:1px solid #0e3f86}
.who{display:flex;align-items:flex-end;gap:14px;margin:-48px 4px 8px}
.avatar{width:96px;height:96px;border-radius:50%;border:3px solid #fff;background:linear-gradient(180deg,#7cc0ff,#1d5fc0);object-fit:cover;flex:none}
.avatar{display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;font-size:32px}
.avatar.small{font-size:16px;width:44px;height:44px;border-width:1px;border-color:#0e3f86}
h1{margin:6px 0 0;font-size:22px}
.handle{color:#555;font-size:13px;word-break:break-all}
.bio{margin:10px 4px}
.bio p{margin:0 0 8px}
dl.fields{margin:10px 4px;display:grid;grid-template-columns:max-content 1fr;gap:4px 12px;font-size:13px}
dl.fields dt{font-weight:bold;color:#444}
dl.fields dd{margin:0;word-break:break-all}
dd.verified{color:#1b6a24;font-weight:bold}
.stats{display:flex;background:#fff;border:1px solid #adadad;border-radius:9px;margin:12px 0}
.stats div{flex:1;text-align:center;padding:10px}
.stats div+div{border-left:1px solid #cfcfcf}
.stats b{display:block;font-size:17px}
.stats span{font-size:12px;color:#444}
.card{background:#fff;border:1px solid #adadad;border-radius:9px;box-shadow:0 1px 3px rgba(0,0,0,.16);padding:14px;margin:12px 0}
.post-head{display:flex;gap:10px;align-items:center;margin-bottom:8px}
.post-head .meta{flex:1;min-width:0}
.post-head a{text-decoration:none;color:inherit}
.content p{margin:0 0 8px}
.cw{font-weight:bold}
.media{display:grid;gap:3px;margin-top:10px;border-radius:7px;overflow:hidden}
.media.two{grid-template-columns:1fr 1fr}
.media img,.media video{width:100%;display:block;max-height:640px;object-fit:cover;background:#000}
.counts{margin-top:10px;font-size:12px;color:#555}
.empty{text-align:center;color:#555;margin:32px 0}
.notice{background:#fff4d6;border:1px solid #d8b24a;border-radius:6px;padding:10px;margin:16px 4px}
.app{margin:16px 4px;font-size:13px;color:#444}
.app code{background:#fff;border:1px solid #ccc;border-radius:4px;padding:1px 4px}
`;

export function page(input: { title: string; body: string; head?: string; origin: string }): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(input.title)}</title><style>${STYLE}</style>${input.head ?? ""}</head>
<body><header class="bar"><a class="brand" href="${escape(input.origin)}/">Pinstripe</a><span class="handle">Short videos for the fediverse</span></header>
<main>${input.body}</main></body></html>`;
}

const plain = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();

/** The full handle, `@user@server`. */
function handle(account: MastodonAccount, domain: string): string {
  return `@${account.acct.includes("@") ? account.acct : `${account.acct}@${domain}`}`;
}

const isMissing = (url: string) => url.includes("/missing.png");

function avatar(account: MastodonAccount, small = false): string {
  return isMissing(account.avatar)
    ? `<span class="avatar${small ? " small" : ""}" aria-hidden="true">${escape([...(account.display_name || account.username)][0]?.toUpperCase() ?? "")}</span>`
    : `<img class="avatar${small ? " small" : ""}" src="${escape(account.avatar)}" alt="">`;
}

function mediaHtml(media: MastodonMedia[]): string {
  const ready = media.filter((m) => m.url);
  if (!ready.length) return "";
  const items = ready
    .map((m) =>
      m.type === "video"
        ? `<video controls playsinline preload="none" src="${escape(m.url!)}"${m.preview_url ? ` poster="${escape(m.preview_url)}"` : ""}${m.description ? ` aria-label="${escape(m.description)}"` : ""}></video>`
        : `<a href="${escape(m.url!)}"><img loading="lazy" src="${escape(m.preview_url ?? m.url!)}" alt="${escape(m.description ?? "")}"></a>`,
    )
    .join("");
  return `<div class="media${ready.length > 1 ? " two" : ""}">${items}</div>`;
}

/** One post as a card. `content` is the server's own sanitized HTML. */
export function postCard(status: MastodonStatus, domain: string, options: { link?: boolean } = {}): string {
  const s = status.reblog ?? status;
  const when = new Date(s.created_at);
  const time = `<time datetime="${escape(s.created_at)}">${escape(when.toUTCString().replace(/:\d\d GMT$/, " UTC"))}</time>`;
  const permalink = s.url ?? s.uri;
  return `<article class="card">
${status.reblog ? `<p class="handle">Boosted by ${escape(status.account.display_name || status.account.username)}</p>` : ""}
<div class="post-head">${avatar(s.account, true)}<div class="meta"><a href="${escape(s.account.url)}"><b>${escape(s.account.display_name || s.account.username)}</b></a>
<div class="handle">${escape(handle(s.account, domain))} · ${options.link === false ? time : `<a href="${escape(permalink)}">${time}</a>`}</div></div></div>
${s.spoiler_text ? `<details><summary class="cw">${escape(s.spoiler_text)}</summary><div class="content">${s.content}</div>${mediaHtml(s.media_attachments)}</details>` : `<div class="content">${s.content}</div>${mediaHtml(s.media_attachments)}`}
<div class="counts">${s.replies_count} replies · ${s.reblogs_count} boosts · ${s.favourites_count} favourites${s.pinstripe.views_count ? ` · ${s.pinstripe.views_count} views` : ""}</div>
</article>`;
}

const followHint = (h: string) =>
  `<p class="app">To follow, reply or like, search for <code>${escape(h)}</code> in the Pinstripe app or on your own fediverse server.</p>`;

export function profilePage(input: {
  account: MastodonAccount;
  statuses: MastodonStatus[];
  domain: string;
  origin: string;
  actorUri: string;
  hideCounts: boolean;
}): string {
  const { account, domain } = input;
  const h = handle(account, domain);
  const name = account.display_name || account.username;
  const fields = account.fields.length
    ? `<dl class="fields">${account.fields
        .map((f) => {
          // rel="me" on links lets other sites verify they belong to this profile.
          const value = /^https?:\/\/\S+$/.test(f.value)
            ? `<a href="${escape(f.value)}" rel="me nofollow noopener" target="_blank">${escape(f.value.replace(/^https?:\/\//, ""))}</a>`
            : escape(f.value);
          return `<dt>${escape(f.name)}</dt><dd${f.verified_at ? ' class="verified"' : ""}>${f.verified_at ? "✓ " : ""}${value}</dd>`;
        })
        .join("")}</dl>`
    : "";
  const stats = `<div class="stats"><div><b>${account.statuses_count}</b><span>Posts</span></div>${
    input.hideCounts ? "" : `<div><b>${account.following_count}</b><span>Following</span></div><div><b>${account.followers_count}</b><span>Followers</span></div>`
  }</div>`;
  const posts = input.statuses.length
    ? input.statuses.map((s) => postCard(s, domain)).join("")
    : `<p class="empty">No public posts yet.</p>`;
  const description = plain(account.note).slice(0, 200);
  return page({
    title: `${name} (${h}) · Pinstripe`,
    origin: input.origin,
    head: `<link rel="alternate" type="application/activity+json" href="${escape(input.actorUri)}">
<meta property="og:type" content="profile"><meta property="og:title" content="${escape(`${name} (${h})`)}">
<meta property="og:description" content="${escape(description)}">${isMissing(account.avatar) ? "" : `<meta property="og:image" content="${escape(account.avatar)}">`}
<meta property="og:url" content="${escape(account.url)}">${account.discoverable ? "" : '<meta name="robots" content="noindex">'}`,
    body: `<div class="banner"${isMissing(account.header) ? "" : ` style="background-image:url('${escape(account.header)}')"`}></div>
<div class="who">${avatar(account)}<div><h1>${escape(name)}</h1><div class="handle">${escape(h)}</div></div></div>
<div class="bio">${account.note}</div>${fields}${stats}${followHint(h)}${posts}`,
  });
}

export function statusPage(input: { status: MastodonStatus; replies: MastodonStatus[]; domain: string; origin: string }): string {
  const { status, domain } = input;
  const s = status.reblog ?? status;
  const name = s.account.display_name || s.account.username;
  const text = s.spoiler_text || plain(s.content);
  const video = s.media_attachments.find((m) => m.type === "video" && m.url);
  const image = s.media_attachments.find((m) => m.preview_url);
  return page({
    title: `${name}: “${text.slice(0, 60)}${text.length > 60 ? "…" : ""}” · Pinstripe`,
    origin: input.origin,
    head: `<link rel="alternate" type="application/activity+json" href="${escape(s.uri)}">
<meta property="og:type" content="${video ? "video.other" : "article"}"><meta property="og:title" content="${escape(`${name} (${handle(s.account, domain)})`)}">
<meta property="og:description" content="${escape(text.slice(0, 300))}"><meta property="og:url" content="${escape(s.url ?? s.uri)}">
${image ? `<meta property="og:image" content="${escape(image.preview_url!)}">` : ""}${video ? `<meta property="og:video" content="${escape(video.url!)}"><meta property="og:video:type" content="video/mp4">` : ""}`,
    body: `${postCard(status, domain, { link: false })}
${input.replies.length ? `<h2 class="handle">Replies</h2>${input.replies.map((r) => postCard(r, domain)).join("")}` : ""}
${followHint(handle(s.account, domain))}`,
  });
}

export function tagPage(input: { tag: string; statuses: MastodonStatus[]; domain: string; origin: string }): string {
  return page({
    title: `#${input.tag} · Pinstripe`,
    origin: input.origin,
    body: `<h1>#${escape(input.tag)}</h1>${
      input.statuses.length ? input.statuses.map((s) => postCard(s, input.domain)).join("") : `<p class="empty">No public posts with #${escape(input.tag)} yet.</p>`
    }`,
  });
}

export function notFoundPage(origin: string, message = "This page doesn't exist, or isn't public."): string {
  return page({ title: "Not found · Pinstripe", origin, body: `<p class="notice">${escape(message)}</p>` });
}
