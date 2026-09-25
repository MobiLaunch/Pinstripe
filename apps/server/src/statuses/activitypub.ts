/**
 * Statuses as ActivityPub objects: the Note other servers fetch, and the
 * Create / Announce / Delete / Undo activities sent to followers.
 */
import type { Context } from "@fedify/fedify";
import { Announce, Create, Delete, Hashtag, Note, PUBLIC_COLLECTION, Tombstone, Undo } from "@fedify/vocab";
import { Temporal } from "@js-temporal/polyfill";
import type { Visibility } from "@pinstripe/core";
import type { LocalAccount } from "../store.ts";
import type { StatusRow, StatusView } from "./store.ts";

const instant = (d: Date) => Temporal.Instant.fromEpochMilliseconds(d.getTime());

export function noteUri(ctx: Context<unknown>, status: Pick<StatusRow, "accountId" | "id">): URL {
  return ctx.getObjectUri(Note, { identifier: status.accountId, id: status.id });
}

/** Mastodon's addressing for each visibility. */
function addressing(ctx: Context<unknown>, accountId: string, visibility: Visibility): { tos: URL[]; ccs: URL[] } {
  const followers = ctx.getFollowersUri(accountId);
  switch (visibility) {
    case "public":
      return { tos: [PUBLIC_COLLECTION], ccs: [followers] };
    case "unlisted":
      return { tos: [followers], ccs: [PUBLIC_COLLECTION] };
    case "followers":
      return { tos: [followers], ccs: [] };
    case "direct":
      return { tos: [], ccs: [] };
  }
}

export function buildNote(
  ctx: Context<unknown>,
  status: StatusRow,
  account: LocalAccount,
  replyTarget: URL | null,
): Note {
  return new Note({
    id: noteUri(ctx, status),
    attribution: ctx.getActorUri(account.id),
    ...addressing(ctx, account.id, status.visibility),
    content: status.content,
    summary: status.spoilerText || null,
    sensitive: status.sensitive,
    published: instant(status.createdAt),
    url: new URL(`/@${account.username}/${status.id}`, ctx.canonicalOrigin),
    replyTarget,
    tags: status.tags.map(
      (tag) => new Hashtag({ name: `#${tag}`, href: new URL(`/tags/${encodeURIComponent(tag)}`, ctx.canonicalOrigin) }),
    ),
  });
}

export function buildCreate(ctx: Context<unknown>, note: Note, status: StatusRow): Create {
  return new Create({
    id: new URL(`${noteUri(ctx, status).href}/activity`),
    actor: ctx.getActorUri(status.accountId),
    ...addressing(ctx, status.accountId, status.visibility),
    published: instant(status.createdAt),
    object: note,
  });
}

/** A boost. `original` is the boosted status's Note URI; `originalAuthor` its author's actor. */
export function buildAnnounce(ctx: Context<unknown>, reblog: StatusRow, original: URL, originalAuthor: URL): Announce {
  const followers = ctx.getFollowersUri(reblog.accountId);
  return new Announce({
    id: new URL(`${noteUri(ctx, reblog).href}/activity`),
    actor: ctx.getActorUri(reblog.accountId),
    tos: [PUBLIC_COLLECTION],
    ccs: [followers, originalAuthor],
    published: instant(reblog.createdAt),
    object: original,
  });
}

export function buildUndoAnnounce(ctx: Context<unknown>, announce: Announce, reblog: StatusRow): Undo {
  return new Undo({
    id: new URL(`${noteUri(ctx, reblog).href}#undo`),
    actor: ctx.getActorUri(reblog.accountId),
    tos: [PUBLIC_COLLECTION],
    object: announce,
  });
}

export function buildDelete(ctx: Context<unknown>, status: StatusRow): Delete {
  const id = noteUri(ctx, status);
  return new Delete({
    id: new URL(`${id.href}#delete`),
    actor: ctx.getActorUri(status.accountId),
    ...addressing(ctx, status.accountId, status.visibility),
    object: new Tombstone({ id }),
  });
}

/** The Note for a status, with its reply target resolved. */
export function noteFor(ctx: Context<unknown>, view: StatusView): Note {
  const { status } = view;
  const replyTarget =
    status.inReplyToId && status.inReplyToAccountId
      ? noteUri(ctx, { id: status.inReplyToId, accountId: status.inReplyToAccountId })
      : null;
  return buildNote(ctx, status, view.account, replyTarget);
}

/** What a status looks like in an outbox: Create for posts, Announce for boosts. */
export function activityFor(ctx: Context<unknown>, view: StatusView): Create | Announce {
  if (view.reblog) {
    const original = view.reblog.status;
    return buildAnnounce(ctx, view.status, noteUri(ctx, original), ctx.getActorUri(original.accountId));
  }
  return buildCreate(ctx, noteFor(ctx, view), view.status);
}
