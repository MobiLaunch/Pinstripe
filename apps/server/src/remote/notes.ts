/**
 * Posts from other servers: turning a Note into a stored status, and
 * deciding whether it's worth keeping.
 */
import type { Context } from "@fedify/fedify";
import { Document, Hashtag, Image, Mention, Note, PUBLIC_COLLECTION, Video } from "@fedify/vocab";
import type { Visibility } from "@pinstripe/core";
import type { ContextData } from "../federation.ts";
import type { RemoteMedia, StatusRow } from "../statuses/store.ts";
import type { AccountRow } from "../store.ts";
import { resolveActorUri } from "./actors.ts";
import { htmlToPlain, sanitizeRemoteHtml } from "./sanitize.ts";

const PUBLIC = new Set([PUBLIC_COLLECTION.href, "as:Public", "Public"]);
// A post mentioning hundreds of accounts is spam; don't resolve them all.
const MAX_MENTIONS = 20;
const MAX_ATTACHMENTS = 4;

const httpUrl = (u: unknown): string | null => {
  const url = u instanceof URL ? u : (u as { href?: URL } | null)?.href;
  return url instanceof URL && /^https?:$/.test(url.protocol) ? url.href : null;
};

/** Photos and videos on a remote Note, linked where they live. */
async function attachmentsOf(note: Note): Promise<RemoteMedia[]> {
  const media: RemoteMedia[] = [];
  try {
    for await (const a of note.getAttachments()) {
      if (media.length >= MAX_ATTACHMENTS) break;
      if (!(a instanceof Document || a instanceof Image || a instanceof Video)) continue;
      const url = httpUrl(a.url);
      const mediaType = a.mediaType ?? (a instanceof Video ? "video/mp4" : a instanceof Image ? "image/jpeg" : "");
      const type = mediaType.startsWith("video/") ? "video" : mediaType.startsWith("image/") ? "image" : null;
      if (!url || !type) continue;
      media.push({
        type,
        url,
        previewUrl: null,
        contentType: mediaType,
        width: a.width ?? null,
        height: a.height ?? null,
        duration: null,
        description: htmlToPlain(String(a.name ?? "")).slice(0, 1500),
        blurhash: null,
      });
    }
  } catch {
    // A broken attachment shouldn't lose the post.
  }
  return media;
}

function visibilityOf(note: Note, author: AccountRow): Visibility {
  const to = note.toIds.map((u) => u.href);
  const cc = note.ccIds.map((u) => u.href);
  if (to.some((u) => PUBLIC.has(u))) return "public";
  if (cc.some((u) => PUBLIC.has(u))) return "unlisted";
  if (author.followersUri && [...to, ...cc].includes(author.followersUri)) return "followers";
  return "direct";
}

/** The status a URI refers to, whether it's one of ours or one we've stored. */
export async function statusByUri(ctx: Context<ContextData>, uri: URL): Promise<StatusRow | null> {
  const local = ctx.parseUri(uri);
  if (local?.type === "object" && local.class === Note) return ctx.data.statuses.get(local.values.id ?? "");
  return ctx.data.statuses.getByUri(uri.href);
}

interface Parsed {
  author: AccountRow;
  visibility: Visibility;
  mentioned: AccountRow[];
  tags: string[];
  parent: StatusRow | null;
}

async function parse(ctx: Context<ContextData>, note: Note): Promise<Parsed | null> {
  if (!note.id || !note.attributionId) return null;
  // A Note must come from the server it claims to be on.
  if (note.id.origin !== note.attributionId.origin) return null;
  const author = await resolveActorUri(ctx, note.attributionId);
  if (!author || author.domain === null) return null;

  const mentioned: AccountRow[] = [];
  const tags = new Set<string>();
  for await (const tag of note.getTags()) {
    if (tag instanceof Mention && tag.href && mentioned.length < MAX_MENTIONS) {
      const account = await resolveActorUri(ctx, tag.href);
      if (account) mentioned.push(account);
    } else if (tag instanceof Hashtag && tag.name) {
      const name = String(tag.name).replace(/^#/, "").toLowerCase();
      if (name) tags.add(name);
    }
  }
  const parent = note.replyTargetId ? await statusByUri(ctx, note.replyTargetId) : null;
  return { author, visibility: visibilityOf(note, author), mentioned, tags: [...tags], parent };
}

/**
 * Is this post relevant here? Keep it if someone local follows the author,
 * it mentions someone local, or it replies to a post we have. Otherwise
 * we'd be storing the whole fediverse.
 */
async function relevant(ctx: Context<ContextData>, p: Parsed): Promise<boolean> {
  if (p.mentioned.some((a) => a.domain === null)) return true;
  if (p.parent) return true;
  return ctx.data.store.hasLocalFollowers(p.author.id);
}

/**
 * Stores (or updates) a remote Note. Returns the stored status, or null if
 * it's invalid or not relevant. `force` skips the relevance check, for
 * posts someone here boosted or looked up.
 */
export async function persistNote(ctx: Context<ContextData>, note: Note, options: { force?: boolean } = {}): Promise<StatusRow | null> {
  const local = await statusByUri(ctx, note.id!);
  if (local && local.uri === null) return local; // One of ours, echoed back.

  const p = await parse(ctx, note);
  if (!p) return null;
  if (!options.force && !local && !(await relevant(ctx, p))) return null;

  const url = note.url;
  const content = sanitizeRemoteHtml(String(note.content ?? ""));
  const spoilerText = htmlToPlain(String(note.summary ?? ""));
  return ctx.data.statuses.upsertRemote({
    uri: note.id!.href,
    url: url instanceof URL ? url.href : (url?.href?.href ?? null),
    accountId: p.author.id,
    text: "",
    content,
    tags: p.tags,
    visibility: p.visibility,
    inReplyToId: p.parent?.id ?? null,
    inReplyToAccountId: p.parent?.accountId ?? null,
    sensitive: (note.sensitive ?? false) || !!spoilerText,
    spoilerText,
    language: null,
    mentionIds: p.mentioned.map((a) => a.id),
    remoteMedia: await attachmentsOf(note),
    publishedAt: note.published ? new Date(note.published.epochMilliseconds) : new Date(),
  });
}
