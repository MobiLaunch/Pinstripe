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
  PropertyValue,
  Person,
  Service,
  Undo,
  isActor,
} from "@fedify/vocab";
import { Temporal } from "@js-temporal/polyfill";
import type { Store } from "./store.ts";

/** Passed to every Fedify callback; gives them the store without globals. */
export interface ContextData {
  store: Store;
}

export interface FederationOptions {
  kv: KvStore;
  queue?: MessageQueue;
  /** Canonical public origin, e.g. `https://pinstripe.social`. */
  origin?: string;
  version: string;
}

export function buildFederation(options: FederationOptions): Federation<ContextData> {
  const federation = createFederation<ContextData>({
    kv: options.kv,
    queue: options.queue,
    origin: options.origin,
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
      localPosts: 0,
      localComments: 0,
    },
  }));

  return federation;
}
