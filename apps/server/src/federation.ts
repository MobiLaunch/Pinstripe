import {
  type Federation,
  type KvStore,
  type MessageQueue,
  createFederation,
} from "@fedify/fedify";
import {
  Accept,
  Endpoints,
  Follow,
  Note,
  PropertyValue,
  Person,
  Service,
  Undo,
  isActor,
} from "@fedify/vocab";
import { Temporal } from "@js-temporal/polyfill";
import { activityFor, noteFor } from "./statuses/activitypub.ts";
import { DEFAULT_LIMIT, type StatusStore } from "./statuses/store.ts";
import type { Store } from "./store.ts";

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
  /** Tests only: allow delivering to localhost. Never in production (SSRF). */
  allowPrivateAddress?: boolean;
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
      const account = await ctx.data.store.getAccount(identifier);
      if (!account) return null;
      const keys = await ctx.getActorKeyPairs(identifier);
      const Actor = account.bot ? Service : Person;
      return new Actor({
        id: ctx.getActorUri(identifier),
        preferredUsername: account.username,
        name: account.displayName,
        summary: account.bio,
        url: new URL(`/@${account.username}`, ctx.canonicalOrigin),
        published: Temporal.Instant.fromEpochMilliseconds(account.createdAt.getTime()),
        inbox: ctx.getInboxUri(identifier),
        endpoints: new Endpoints({ sharedInbox: ctx.getInboxUri() }),
        followers: ctx.getFollowersUri(identifier),
        outbox: ctx.getOutboxUri(identifier),
        manuallyApprovesFollowers: account.settings.approveFollowers,
        discoverable: account.settings.listInDirectory,
        attachments: account.fields.map((f) => new PropertyValue({ name: f.name, value: f.value })),
        publicKey: keys[0]?.cryptographicKey,
        assertionMethods: keys.map((k) => k.multikey),
      });
    })
    // Handles are mutable; the actor identifier is the stable account id.
    .mapHandle(async (ctx, username) => (await ctx.data.store.getAccountByUsername(username))?.id ?? null)
    .setKeyPairsDispatcher((ctx, identifier) => ctx.data.store.getKeyPairs(identifier));

  federation.setFollowersDispatcher("/users/{identifier}/followers", async (ctx, identifier) => {
    const account = await ctx.data.store.getAccount(identifier);
    if (!account) return null;
    const followers = await ctx.data.store.listFollowers(identifier, "accepted");
    return {
      items: followers.map((f) => ({
        id: new URL(f.actorUri),
        inboxId: new URL(f.inboxUri),
        endpoints: f.sharedInboxUri ? { sharedInbox: new URL(f.sharedInboxUri) } : null,
      })),
    };
  });

  // Each post is fetchable at its id. Only public and unlisted ones for now:
  // serving followers-only posts needs signed-fetch checks.
  federation.setObjectDispatcher(Note, "/users/{identifier}/statuses/{id}", async (ctx, { identifier, id }) => {
    const status = await ctx.data.statuses.get(id);
    if (!status || status.accountId !== identifier || status.reblogOfId) return null;
    if (status.visibility !== "public" && status.visibility !== "unlisted") return null;
    const [view] = await ctx.data.statuses.hydrate([status], null);
    return view ? noteFor(ctx, view) : null;
  });

  // Newest first; the cursor is the last id of the previous page.
  federation
    .setOutboxDispatcher("/users/{identifier}/outbox", async (ctx, identifier, cursor) => {
      if (cursor === null) return null;
      if (!(await ctx.data.store.getAccount(identifier))) return null;
      const rows = await ctx.data.statuses.accountStatuses(
        identifier,
        { maxId: cursor || undefined, limit: DEFAULT_LIMIT },
        { viewerId: null },
      );
      const views = await ctx.data.statuses.hydrate(rows, null);
      return {
        items: views.map((v) => activityFor(ctx, v)),
        nextCursor: rows.length === DEFAULT_LIMIT ? rows.at(-1)!.id : null,
      };
    })
    .setCounter((ctx, identifier) => ctx.data.statuses.countByAccount(identifier))
    .setFirstCursor(() => "");

  federation
    .setInboxListeners("/users/{identifier}/inbox", "/inbox")
    .on(Follow, async (ctx, follow) => {
      if (!follow.id || !follow.actorId || !follow.objectId) return;
      const target = ctx.parseUri(follow.objectId);
      if (target?.type !== "actor") return;
      const account = await ctx.data.store.getAccount(target.identifier);
      if (!account) return;
      const follower = await follow.getActor(ctx);
      if (!isActor(follower) || !follower.id || !follower.inboxId) return;

      const state = account.settings.approveFollowers ? "pending" : "accepted";
      await ctx.data.store.upsertFollower(account.id, {
        actorUri: follower.id.href,
        inboxUri: follower.inboxId.href,
        sharedInboxUri: follower.endpoints?.sharedInbox?.href ?? null,
        followActivityUri: follow.id.href,
        state,
      });
      if (state === "accepted") {
        await ctx.sendActivity(
          { identifier: account.id },
          follower,
          new Accept({ actor: follow.objectId, object: follow }),
        );
      }
    })
    .on(Undo, async (ctx, undo) => {
      const object = await undo.getObject(ctx);
      if (!(object instanceof Follow) || !object.objectId || !undo.actorId) return;
      // Only the original follower may undo a follow.
      if (object.actorId?.href !== undo.actorId.href) return;
      const target = ctx.parseUri(object.objectId);
      if (target?.type !== "actor") return;
      await ctx.data.store.removeFollower(target.identifier, undo.actorId.href);
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
      users: { total: await ctx.data.store.countAccounts() },
      localPosts: await ctx.data.statuses.countAll(),
      localComments: 0,
    },
  }));

  return federation;
}
