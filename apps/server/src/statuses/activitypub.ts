/**
 * Statuses as ActivityPub objects: the Note other servers fetch, and the
 * activities we send (Create, Announce, Like, Delete, Undo, Follow, Accept,
 * Reject).
 */
import type { Context } from "@fedify/fedify";
import {
  Accept,
  Announce,
  Create,
  Delete,
  Document,
  Follow,
  Hashtag,
  Like,
  Mention,
  Note,
  PUBLIC_COLLECTION,
  Reject,
  Tombstone,
  Undo,
} from "@fedify/vocab";
import { Temporal } from "@js-temporal/polyfill";
import type { Visibility } from "@pinstripe/core";
import type { AccountRow, FollowRow } from "../store.ts";
import type { StatusRow, StatusView } from "./store.ts";

const instant = (d: Date) => Temporal.Instant.fromEpochMilliseconds(d.getTime());

/** Any account's actor URI: its own for remote accounts, ours for local ones. */
export function actorUri(ctx: Context<unknown>, account: Pick<AccountRow, "id" | "uri">): URL {
  return account.uri ? new URL(account.uri) : ctx.getActorUri(account.id);
}

/** Any status's ActivityPub id. */
export function noteUri(ctx: Context<unknown>, status: Pick<StatusRow, "accountId" | "id" | "uri">): URL {
  return status.uri ? new URL(status.uri) : ctx.getObjectUri(Note, { identifier: status.accountId, id: status.id });
}

/** The handle as other servers write it in a Mention: `@user@domain`. */
export function mentionName(ctx: Context<unknown>, account: Pick<AccountRow, "username" | "domain">): string {
  return `@${account.username}@${account.domain ?? new URL(ctx.canonicalOrigin).host}`;
}

/** Mastodon's addressing for each visibility, plus mentioned accounts. */
function addressing(ctx: Context<unknown>, accountId: string, visibility: Visibility, mentioned: URL[]): { tos: URL[]; ccs: URL[] } {
  const followers = ctx.getFollowersUri(accountId);
  switch (visibility) {
    case "public":
      return { tos: [PUBLIC_COLLECTION], ccs: [followers, ...mentioned] };
    case "unlisted":
      return { tos: [followers], ccs: [PUBLIC_COLLECTION, ...mentioned] };
    case "followers":
      return { tos: [followers], ccs: mentioned };
    case "direct":
      return { tos: mentioned, ccs: [] };
  }
}

/** Public URLs for stored media, from the MediaService. */
export interface MediaUrls {
  url(row: StatusView["media"][number]): string | null;
}

/** A local status as a Note. `replyTarget` is the parent's URI, if it's a reply. */
export function buildNote(ctx: Context<unknown>, view: StatusView, replyTarget: URL | null, media?: MediaUrls): Note {
  const { status, account } = view;
  const mentioned = view.mentions.map((m) => actorUri(ctx, m));
  return new Note({
    id: noteUri(ctx, status),
    attribution: ctx.getActorUri(account.id),
    ...addressing(ctx, account.id, status.visibility, mentioned),
    content: status.content,
    summary: status.spoilerText || null,
    sensitive: status.sensitive,
    published: instant(status.createdAt),
    url: new URL(`/@${account.username}/${status.id}`, ctx.canonicalOrigin),
    replyTarget,
    // Mastodon sends attachments as Documents with a media type; others read those too.
    attachments: view.media.flatMap((m) => {
      const url = media?.url(m);
      return url
        ? [
            new Document({
              url: new URL(url),
              mediaType: m.contentType,
              name: m.description || null,
              width: m.meta.width,
              height: m.meta.height,
            }),
          ]
        : [];
    }),
    tags: [
      ...status.tags.map(
        (tag) => new Hashtag({ name: `#${tag}`, href: new URL(`/tags/${encodeURIComponent(tag)}`, ctx.canonicalOrigin) }),
      ),
      ...view.mentions.map((m) => new Mention({ name: mentionName(ctx, m), href: actorUri(ctx, m) })),
    ],
  });
}

export function buildCreate(ctx: Context<unknown>, note: Note, view: StatusView): Create {
  const { status } = view;
  return new Create({
    id: new URL(`${noteUri(ctx, status).href}/activity`),
    actor: ctx.getActorUri(status.accountId),
    ...addressing(ctx, status.accountId, status.visibility, view.mentions.map((m) => actorUri(ctx, m))),
    published: instant(status.createdAt),
    object: note,
  });
}

/** A boost by a local account. `original` is the boosted Note's URI; `originalAuthor` its author's actor. */
export function buildAnnounce(ctx: Context<unknown>, reblog: StatusRow, original: URL, originalAuthor: URL): Announce {
  return new Announce({
    id: new URL(`${noteUri(ctx, reblog).href}/activity`),
    actor: ctx.getActorUri(reblog.accountId),
    tos: [PUBLIC_COLLECTION],
    ccs: [ctx.getFollowersUri(reblog.accountId), originalAuthor],
    published: instant(reblog.createdAt),
    object: original,
  });
}

export function buildUndo(ctx: Context<unknown>, accountId: string, object: Announce | Like | Follow): Undo {
  return new Undo({
    id: new URL(`${object.id!.href}#undo`),
    actor: ctx.getActorUri(accountId),
    object,
  });
}

export function buildDelete(ctx: Context<unknown>, view: StatusView): Delete {
  const id = noteUri(ctx, view.status);
  return new Delete({
    id: new URL(`${id.href}#delete`),
    actor: ctx.getActorUri(view.status.accountId),
    ...addressing(ctx, view.status.accountId, view.status.visibility, view.mentions.map((m) => actorUri(ctx, m))),
    object: new Tombstone({ id }),
  });
}

/** A favourite of someone else's post. The id is stable so it can be undone. */
export function buildLike(ctx: Context<unknown>, accountId: string, status: StatusRow): Like {
  const actor = ctx.getActorUri(accountId);
  return new Like({ id: new URL(`${actor.href}#likes/${status.id}`), actor, object: noteUri(ctx, status) });
}

/** A follow we send. Its id is stored on the follow so the other side's Accept can be matched. */
export function followActivityUri(ctx: Context<unknown>, followerId: string, followId: string): URL {
  return new URL(`${ctx.getActorUri(followerId).href}#follows/${followId}`);
}

export function buildFollow(ctx: Context<unknown>, follow: FollowRow, target: AccountRow): Follow {
  return new Follow({
    id: follow.uri ? new URL(follow.uri) : followActivityUri(ctx, follow.followerId, follow.id),
    actor: ctx.getActorUri(follow.followerId),
    object: actorUri(ctx, target),
  });
}

/** Answering a remote follow (request). `follow` is the stored follow, whose uri is theirs. */
export function buildFollowResponse(
  ctx: Context<unknown>,
  kind: "accept" | "reject",
  follow: FollowRow,
  follower: AccountRow,
): Accept | Reject {
  const Response = kind === "accept" ? Accept : Reject;
  const me = ctx.getActorUri(follow.followingId);
  return new Response({
    id: new URL(`${me.href}#${kind}s/${follow.id}`),
    actor: me,
    object: new Follow({
      id: follow.uri ? new URL(follow.uri) : null,
      actor: actorUri(ctx, follower),
      object: me,
    }),
  });
}

/** What a status looks like in an outbox: Create for posts, Announce for boosts. */
export function activityFor(ctx: Context<unknown>, view: StatusView, replyTarget: URL | null, media?: MediaUrls): Create | Announce {
  if (view.reblog) {
    const original = view.reblog;
    return buildAnnounce(ctx, view.status, noteUri(ctx, original.status), actorUri(ctx, original.account));
  }
  return buildCreate(ctx, buildNote(ctx, view, replyTarget, media), view);
}
