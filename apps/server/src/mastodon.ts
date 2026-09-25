/**
 * Serializers for the Mastodon client API. Field names and shapes follow
 * https://docs.joinmastodon.org/entities/ so any Mastodon client (including
 * ours) can read them.
 */
import type { Visibility } from "@pinstripe/core";
import type { LocalAccount } from "./store.ts";

/** Mastodon calls followers-only posts "private". */
export function toMastodonVisibility(v: Visibility): "public" | "unlisted" | "private" | "direct" {
  return v === "followers" ? "private" : v;
}

export interface MastodonAccount {
  id: string;
  username: string;
  /** Local accounts: bare username. Remote: `user@domain`. */
  acct: string;
  display_name: string;
  locked: boolean;
  bot: boolean;
  discoverable: boolean;
  group: boolean;
  created_at: string;
  note: string;
  url: string;
  uri: string;
  avatar: string;
  avatar_static: string;
  header: string;
  header_static: string;
  followers_count: number;
  following_count: number;
  statuses_count: number;
  last_status_at: string | null;
  emojis: [];
  fields: { name: string; value: string; verified_at: string | null }[];
}

export function serializeAccount(
  account: LocalAccount,
  urls: { profile: URL; actor: URL; missingAvatar: URL; missingHeader: URL },
  counts: { followers: number; following: number; statuses: number },
): MastodonAccount {
  const hide = account.settings.hideFollowerCounts;
  return {
    id: account.id,
    username: account.username,
    acct: account.username,
    display_name: account.displayName,
    locked: account.settings.approveFollowers,
    bot: account.bot,
    discoverable: account.settings.listInDirectory,
    group: false,
    created_at: startOfDayUtc(account.createdAt),
    note: account.bio,
    url: urls.profile.href,
    uri: urls.actor.href,
    avatar: urls.missingAvatar.href,
    avatar_static: urls.missingAvatar.href,
    header: urls.missingHeader.href,
    header_static: urls.missingHeader.href,
    // Mastodon reports hidden counts as 0; the app shows them as hidden.
    followers_count: hide ? 0 : counts.followers,
    following_count: hide ? 0 : counts.following,
    statuses_count: counts.statuses,
    last_status_at: null,
    emojis: [],
    fields: account.fields.map((f) => ({ name: f.name, value: f.value, verified_at: f.verifiedAt })),
  };
}

// Mastodon truncates created_at to midnight UTC to avoid leaking signup times.
function startOfDayUtc(date: Date): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

export function fromMastodonVisibility(v: string | undefined): Visibility | null {
  switch (v) {
    case "public":
    case "unlisted":
    case "direct":
      return v;
    case "private":
      return "followers";
    default:
      return null;
  }
}

export interface MastodonStatus {
  id: string;
  uri: string;
  url: string | null;
  created_at: string;
  edited_at: null;
  account: MastodonAccount;
  content: string;
  /** Only in DELETE responses, for "delete and redraft". */
  text?: string;
  visibility: "public" | "unlisted" | "private" | "direct";
  sensitive: boolean;
  spoiler_text: string;
  language: string | null;
  in_reply_to_id: string | null;
  in_reply_to_account_id: string | null;
  reblog: MastodonStatus | null;
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
  favourited?: boolean;
  reblogged?: boolean;
  muted?: boolean;
  bookmarked?: boolean;
  pinned?: boolean;
  media_attachments: [];
  mentions: [];
  tags: { name: string; url: string }[];
  emojis: [];
  card: null;
  poll: null;
  application: null;
  filtered: [];
}

export interface StatusUrls {
  /** ActivityPub id: the Note's URI, or the Announce's for a boost. */
  uri: string;
  url: string | null;
  tagUrl: (tag: string) => string;
}

export function serializeStatus(
  view: {
    status: {
      id: string;
      content: string;
      visibility: Visibility;
      sensitive: boolean;
      spoilerText: string;
      language: string | null;
      inReplyToId: string | null;
      inReplyToAccountId: string | null;
      tags: string[];
      createdAt: Date;
    };
    counts: { replies: number; reblogs: number; favourites: number };
    viewer: { favourited: boolean; reblogged: boolean } | null;
  },
  account: MastodonAccount,
  urls: StatusUrls,
  reblog: MastodonStatus | null,
): MastodonStatus {
  const { status, counts, viewer } = view;
  return {
    id: status.id,
    uri: urls.uri,
    url: urls.url,
    created_at: status.createdAt.toISOString(),
    edited_at: null,
    account,
    content: status.content,
    visibility: toMastodonVisibility(status.visibility),
    sensitive: status.sensitive,
    spoiler_text: status.spoilerText,
    language: status.language,
    in_reply_to_id: status.inReplyToId,
    in_reply_to_account_id: status.inReplyToAccountId,
    reblog,
    replies_count: counts.replies,
    reblogs_count: counts.reblogs,
    favourites_count: counts.favourites,
    ...(viewer ? { favourited: viewer.favourited, reblogged: viewer.reblogged, muted: false, bookmarked: false, pinned: false } : {}),
    media_attachments: [],
    // Local mentions are links in `content`; structured mentions arrive with remote mentions.
    mentions: [],
    tags: status.tags.map((name) => ({ name, url: urls.tagUrl(name) })),
    emojis: [],
    card: null,
    poll: null,
    application: null,
    filtered: [],
  };
}
