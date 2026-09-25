/**
 * Remote accounts: turning ActivityPub actors into stored accounts, and
 * finding accounts by handle or URI (WebFinger + fetch when we haven't seen
 * them yet).
 */
import type { Context } from "@fedify/fedify";
import { type Actor, Application, Image, isActor, PropertyValue, Service } from "@fedify/vocab";
import type { ContextData } from "../federation.ts";
import type { AccountRow } from "../store.ts";
import { htmlToPlain, sanitizeRemoteHtml } from "./sanitize.ts";

// Refetch a remote profile at most this often when it's looked up again.
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 8_000;

const text = (v: unknown) => (v === null || v === undefined ? "" : String(v));

async function imageUrl(get: () => Promise<unknown>): Promise<string | null> {
  try {
    const image = await get();
    if (!(image instanceof Image)) return null;
    const url = image.url;
    const href = url instanceof URL ? url : url?.href;
    return href && /^https?:$/.test(href.protocol) ? href.href : null;
  } catch {
    return null;
  }
}

/** A collection's size, if the server shares it. Many hide follower lists; that's fine. */
async function totalItems(get: () => Promise<{ totalItems: number | null } | null>): Promise<number | null> {
  try {
    const collection = await withTimeout(get());
    const n = collection?.totalItems;
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Stores (or refreshes) a remote actor and returns its account. Local actors resolve to the local account. */
export async function persistActor(ctx: Context<ContextData>, actor: Actor): Promise<AccountRow | null> {
  if (!actor.id || !actor.inboxId) return null;
  const local = ctx.parseUri(actor.id);
  if (local?.type === "actor") return ctx.data.store.getLocalAccount(local.identifier);

  const username = text(actor.preferredUsername).trim();
  if (!username) return null;
  const fields: AccountRow["fields"] = [];
  try {
    for await (const attachment of actor.getAttachments()) {
      if (attachment instanceof PropertyValue && fields.length < 16) {
        fields.push({ name: htmlToPlain(text(attachment.name)), value: sanitizeRemoteHtml(text(attachment.value)), verifiedAt: null });
      }
    }
  } catch {
    // Attachments are optional decoration; a broken one shouldn't lose the account.
  }
  const url = actor.url;
  const [avatarUrl, headerUrl, followersCount, followingCount, statusesCount] = await Promise.all([
    imageUrl(() => actor.getIcon()),
    imageUrl(() => actor.getImage()),
    totalItems(() => actor.getFollowers()),
    totalItems(() => actor.getFollowing()),
    totalItems(() => actor.getOutbox()),
  ]);
  return ctx.data.store.upsertRemoteAccount({
    uri: actor.id.href,
    username,
    domain: actor.id.host,
    displayName: htmlToPlain(text(actor.name)) || username,
    bio: sanitizeRemoteHtml(text(actor.summary)),
    fields,
    bot: actor instanceof Service || actor instanceof Application,
    locked: actor.manuallyApprovesFollowers ?? false,
    discoverable: actor.discoverable ?? false,
    url: url instanceof URL ? url.href : (url?.href?.href ?? null),
    inboxUri: actor.inboxId.href,
    sharedInboxUri: actor.endpoints?.sharedInbox?.href ?? null,
    followersUri: actor.followersId?.href ?? null,
    avatarUrl,
    headerUrl,
    followersCount,
    followingCount,
    statusesCount,
  });
}

async function withTimeout<T>(promise: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS)));
  try {
    return await Promise.race([promise, timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetches an actor by URI or handle over the network and stores it. */
async function fetchActor(ctx: Context<ContextData>, identifier: string): Promise<AccountRow | null> {
  const object = await withTimeout(ctx.lookupObject(identifier));
  return isActor(object) ? persistActor(ctx, object) : null;
}

/** The account behind an actor URI: from the database, or fetched once. */
export async function resolveActorUri(ctx: Context<ContextData>, uri: URL): Promise<AccountRow | null> {
  const local = ctx.parseUri(uri);
  if (local?.type === "actor") return ctx.data.store.getLocalAccount(local.identifier);
  return (await ctx.data.store.getAccountByUri(uri.href)) ?? fetchActor(ctx, uri.href);
}

/**
 * The account for `user@domain`. Known accounts come from the database
 * (refreshed in the background once stale); unknown ones are looked up
 * with WebFinger only when `resolve` is set, as in Mastodon's search.
 */
export async function resolveHandle(
  ctx: Context<ContextData>,
  username: string,
  domain: string,
  options: { resolve: boolean },
): Promise<AccountRow | null> {
  if (domain.toLowerCase() === new URL(ctx.canonicalOrigin).host.toLowerCase()) {
    return ctx.data.store.getAccountByUsername(username);
  }
  const known = await ctx.data.store.getAccountByHandle(username, domain);
  if (known) {
    if (options.resolve && (!known.fetchedAt || Date.now() - known.fetchedAt.getTime() > STALE_AFTER_MS)) {
      void fetchActor(ctx, known.uri ?? `acct:${username}@${domain}`);
    }
    return known;
  }
  return options.resolve ? fetchActor(ctx, `acct:${username}@${domain}`) : null;
}
