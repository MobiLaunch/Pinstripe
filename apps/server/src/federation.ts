import { type Context, createFederation, type Federation, type KvStore, type MessageQueue } from "@fedify/fedify";
import {
  Accept,
  Announce,
  Create,
  Delete,
  Endpoints,
  Follow,
  isActor,
  Like,
  Note,
  Person,
  PropertyValue,
  Reject,
  Service,
  Undo,
  Update,
} from "@fedify/vocab";
import { Temporal } from "@js-temporal/polyfill";
import { escapeHtml, plainToHtml } from "./mastodon.ts";
import { persistActor, resolveActorUri } from "./remote/actors.ts";
import { deliver } from "./remote/deliver.ts";
import { persistNote, statusByUri } from "./remote/notes.ts";
import { activityFor, buildFollowResponse, buildNote, noteUri } from "./statuses/activitypub.ts";
import { DEFAULT_LIMIT, type StatusRow, type StatusStore } from "./statuses/store.ts";
import type { AccountRow, Store } from "./store.ts";

/** Passed to every Fedify callback; gives them the stores without globals. */
export interface ContextData {
  store: Store;
  statuses: StatusStore;
}

export interface FederationOptions {
  kv: KvStore;
  queue?: MessageQueue;
  /** Canonical public origin, e.g. `https://pinstripe.social`. */
  origin?: string;
  version: string;
  /** Tests only: allow talking to localhost. Never in production (SSRF). */
  allowPrivateAddress?: boolean;
}

/** The URI of the post a status replies to, if any. */
export async function replyTargetOf(ctx: Context<ContextData>, status: StatusRow): Promise<URL | null> {
  if (!status.inReplyToId) return null;
  const parent = await ctx.data.statuses.get(status.inReplyToId);
  return parent ? noteUri(ctx, parent) : null;
}

/** The remote account that sent an activity, stored locally. Null if it can't be resolved. */
async function sender(ctx: Context<ContextData>, activity: { actorId: URL | null }): Promise<AccountRow | null> {
  if (!activity.actorId) return null;
  const account = await resolveActorUri(ctx, activity.actorId);
  return account && account.domain !== null ? account : null;
}

/**
 * The follow of ours that an Accept or Reject answers: matched by the
 * Follow's id, and only if it comes from the account that was followed.
 */
async function followAnsweredBy(ctx: Context<ContextData>, response: Accept | Reject) {
  const actor = await sender(ctx, response);
  if (!actor || !response.objectId) return null;
  const follow = await ctx.data.store.getFollowByUri(response.objectId.href);
  return follow && follow.followingId === actor.id ? follow : null;
}

export function buildFederation(options: FederationOptions): Federation<ContextData> {
  const federation = createFederation<ContextData>({
    kv: options.kv,
    queue: options.queue,
    origin: options.origin,
    allowPrivateAddress: options.allowPrivateAddress,
  });

  federation
    .setActorDispatcher("/users/{identifier}", async (ctx, identifier) => {
      const account = await ctx.data.store.getLocalAccount(identifier);
      if (!account) return null;
      const keys = await ctx.getActorKeyPairs(identifier);
      const Actor = account.bot ? Service : Person;
      return new Actor({
        id: ctx.getActorUri(identifier),
        preferredUsername: account.username,
        name: account.displayName,
        // Other servers treat these as HTML; ours are plain text.
        summary: plainToHtml(account.bio),
        url: new URL(`/@${account.username}`, ctx.canonicalOrigin),
        published: Temporal.Instant.fromEpochMilliseconds(account.createdAt.getTime()),
        inbox: ctx.getInboxUri(identifier),
        endpoints: new Endpoints({ sharedInbox: ctx.getInboxUri() }),
        followers: ctx.getFollowersUri(identifier),
        outbox: ctx.getOutboxUri(identifier),
        manuallyApprovesFollowers: account.settings.approveFollowers,
        discoverable: account.settings.listInDirectory,
        attachments: account.fields.map((f) => new PropertyValue({ name: f.name, value: escapeHtml(f.value) })),
        publicKey: keys[0]?.cryptographicKey,
        assertionMethods: keys.map((k) => k.multikey),
      });
    })
    // Handles are mutable; the actor identifier is the stable account id.
    .mapHandle(async (ctx, username) => (await ctx.data.store.getAccountByUsername(username))?.id ?? null)
    .setKeyPairsDispatcher(async (ctx, identifier) =>
      (await ctx.data.store.getLocalAccount(identifier)) ? ctx.data.store.getKeyPairs(identifier) : [],
    );

  // Remote followers only; that's who deliveries go to.
  federation
    .setFollowersDispatcher("/users/{identifier}/followers", async (ctx, identifier) => {
      if (!(await ctx.data.store.getLocalAccount(identifier))) return null;
      const followers = await ctx.data.store.remoteFollowers(identifier);
      return {
        items: followers.map((f) => ({
          id: new URL(f.uri),
          inboxId: new URL(f.inboxUri),
          endpoints: f.sharedInboxUri ? { sharedInbox: new URL(f.sharedInboxUri) } : null,
        })),
      };
    })
    .setCounter(async (ctx, identifier) => (await ctx.data.store.followCounts(identifier)).followers);

  // Each post is fetchable at its id. Only public and unlisted ones for now:
  // serving followers-only posts needs signed-fetch checks.
  federation.setObjectDispatcher(Note, "/users/{identifier}/statuses/{id}", async (ctx, { identifier, id }) => {
    const status = await ctx.data.statuses.getVisible(id, null);
    if (!status || status.accountId !== identifier || status.reblogOfId || status.uri) return null;
    const [view] = await ctx.data.statuses.hydrate([status], null);
    return view ? buildNote(ctx, view, await replyTargetOf(ctx, status)) : null;
  });

  // Newest first; the cursor is the last id of the previous page.
  federation
    .setOutboxDispatcher("/users/{identifier}/outbox", async (ctx, identifier, cursor) => {
      if (cursor === null) return null;
      if (!(await ctx.data.store.getLocalAccount(identifier))) return null;
      const rows = await ctx.data.statuses.accountStatuses(
        identifier,
        { maxId: cursor || undefined, limit: DEFAULT_LIMIT },
        { viewerId: null },
      );
      const views = await ctx.data.statuses.hydrate(rows, null);
      return {
        items: await Promise.all(views.map(async (v) => activityFor(ctx, v, await replyTargetOf(ctx, v.status)))),
        nextCursor: rows.length === DEFAULT_LIMIT ? rows.at(-1)!.id : null,
      };
    })
    .setCounter((ctx, identifier) => ctx.data.statuses.countByAccount(identifier))
    .setFirstCursor(() => "");

  federation
    .setInboxListeners("/users/{identifier}/inbox", "/inbox")
    .on(Follow, async (ctx, follow) => {
      if (!follow.id || !follow.objectId) return;
      const target = ctx.parseUri(follow.objectId);
      if (target?.type !== "actor") return;
      const account = await ctx.data.store.getLocalAccount(target.identifier);
      const actor = await follow.getActor(ctx);
      const follower = isActor(actor) ? await persistActor(ctx, actor) : null;
      if (!account || !follower || follower.domain === null) return;

      const existing = await ctx.data.store.getFollow(follower.id, account.id);
      const state = existing?.state === "accepted" || !account.settings.approveFollowers ? "accepted" : "pending";
      const row = await ctx.data.store.follow({ followerId: follower.id, followingId: account.id, state, uri: follow.id.href });
      // Pending requests are answered when the account approves or rejects them.
      if (state === "accepted") {
        await deliver(ctx, account.id, buildFollowResponse(ctx, "accept", row, follower), { to: [follower] });
      }
    })
    .on(Accept, async (ctx, accept) => {
      const follow = await followAnsweredBy(ctx, accept);
      if (follow) await ctx.data.store.acceptFollow(follow.followerId, follow.followingId);
    })
    .on(Reject, async (ctx, reject) => {
      const follow = await followAnsweredBy(ctx, reject);
      if (follow) await ctx.data.store.unfollow(follow.followerId, follow.followingId);
    })
    .on(Undo, async (ctx, undo) => {
      const actor = await sender(ctx, undo);
      if (!actor) return;
      const object = await undo.getObject(ctx);
      if (object instanceof Follow && object.objectId) {
        const target = ctx.parseUri(object.objectId);
        if (target?.type === "actor") await ctx.data.store.unfollow(actor.id, target.identifier);
      } else if (object instanceof Announce && object.id) {
        const reblog = await ctx.data.statuses.getByUri(object.id.href);
        if (reblog?.accountId === actor.id) await ctx.data.statuses.delete(reblog.id);
      } else if (object instanceof Like && object.objectId) {
        const status = await statusByUri(ctx, object.objectId);
        if (status) await ctx.data.statuses.unfavourite(actor.id, status.id);
      }
    })
    .on(Create, async (ctx, create) => {
      const object = await create.getObject(ctx);
      if (!(object instanceof Note) || object.attributionId?.href !== create.actorId?.href) return;
      await persistNote(ctx, object);
    })
    .on(Update, async (ctx, update) => {
      const object = await update.getObject(ctx);
      if (object instanceof Note && object.id && object.attributionId?.href === update.actorId?.href) {
        // Only posts we already have; an edit isn't a reason to start storing one.
        if (await ctx.data.statuses.getByUri(object.id.href)) await persistNote(ctx, object, { force: true });
      } else if (isActor(object) && object.id?.href === update.actorId?.href) {
        await persistActor(ctx, object);
      }
    })
    .on(Delete, async (ctx, del) => {
      const actor = await sender(ctx, del);
      if (!actor || !del.objectId) return;
      if (del.objectId.href === actor.uri) {
        // The account itself was deleted: remove it and everything of theirs.
        await ctx.data.store.deleteAccount(actor.id);
        return;
      }
      const status = await ctx.data.statuses.getByUri(del.objectId.href);
      if (status?.accountId === actor.id) await ctx.data.statuses.delete(status.id);
    })
    .on(Announce, async (ctx, announce) => {
      const actor = await sender(ctx, announce);
      if (!actor || !announce.id || !announce.objectId) return;
      let original = await statusByUri(ctx, announce.objectId);
      // Keep boosts of our own posts (for their counts), and boosts by accounts someone here follows.
      const ours = original !== null && original.uri === null;
      if (!ours && !(await ctx.data.store.hasLocalFollowers(actor.id))) return;
      if (!original) {
        const object = await announce.getObject(ctx);
        if (object instanceof Note) original = await persistNote(ctx, object, { force: true });
      }
      if (!original || (original.visibility !== "public" && original.visibility !== "unlisted")) return;
      const published = announce.published ? new Date(announce.published.epochMilliseconds) : new Date();
      await ctx.data.statuses.reblog(actor.id, original.id, "public", { uri: announce.id.href, publishedAt: published });
    })
    .on(Like, async (ctx, like) => {
      const actor = await sender(ctx, like);
      if (!actor || !like.objectId) return;
      const status = await statusByUri(ctx, like.objectId);
      // Only likes of our own posts count; other servers track theirs.
      if (status && status.uri === null) await ctx.data.statuses.favourite(actor.id, status.id);
    })
    .onError((_ctx, error) => {
      console.error("Inbox error", error);
    });

  federation.setNodeInfoDispatcher("/nodeinfo/2.1", async (ctx) => ({
    software: {
      name: "pinstripe",
      version: options.version,
      repository: new URL("https://github.com/mobilaunch/pinstripe"),
    },
    protocols: ["activitypub"],
    openRegistrations: true,
    usage: {
      users: { total: await ctx.data.store.countLocalAccounts() },
      localPosts: await ctx.data.statuses.countLocal(),
      localComments: 0,
    },
  }));

  return federation;
}
