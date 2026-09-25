/**
 * Serializers for the Mastodon client API. Field names and shapes follow
 * https://docs.joinmastodon.org/entities/ so any Mastodon client (including
 * ours) can read them.
 */
import type { Visibility } from "@pinstripe/core";
import type { AccountRow, Relationship } from "./store.ts";

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

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** Local bios are plain text; Mastodon's `note` is HTML. */
export function plainToHtml(text: string): string {
  const paragraphs = text.trim().split(/\n{2,}/).filter(Boolean);
  return paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`).join("");
}

/**
 * Mastodon's Account entity, for local and remote accounts alike. `urls`
 * and `counts` are worked out by the caller: local accounts' come from
 * this server, remote ones' from what their server told us.
 */
export function serializeAccount(
  account: AccountRow,
  urls: { profile: string; actor: string; avatar: string; header: string },
  counts: { followers: number; following: number; statuses: number },
): MastodonAccount {
  const local = account.domain === null;
  const hide = local && account.settings.hideFollowerCounts;
  return {
    id: account.id,
    username: account.username,
    acct: local ? account.username : `${account.username}@${account.domain}`,
    display_name: account.displayName,
    locked: account.settings.approveFollowers,
    bot: account.bot,
    discoverable: account.settings.listInDirectory,
    group: false,
    created_at: startOfDayUtc(account.createdAt),
    note: local ? plainToHtml(account.bio) : account.bio,
    url: urls.profile,
    uri: urls.actor,
    avatar: urls.avatar,
    avatar_static: urls.avatar,
    header: urls.header,
    header_static: urls.header,
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
  mentions: { id: string; username: string; acct: string; url: string }[];
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
  mentions: MastodonStatus["mentions"] = [],
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
    mentions,
    tags: status.tags.map((name) => ({ name, url: urls.tagUrl(name) })),
    emojis: [],
    card: null,
    poll: null,
    application: null,
    filtered: [],
  };
}

export interface MastodonRelationship {
  id: string;
  following: boolean;
  showing_reblogs: boolean;
  notifying: boolean;
  languages: null;
  followed_by: boolean;
  blocking: boolean;
  blocked_by: boolean;
  muting: boolean;
  muting_notifications: boolean;
  requested: boolean;
  requested_by: boolean;
  domain_blocking: boolean;
  endorsed: boolean;
  note: string;
}

export function serializeRelationship(id: string, r: Relationship): MastodonRelationship {
  return {
    id,
    following: r.following,
    showing_reblogs: r.following,
    notifying: false,
    languages: null,
    followed_by: r.followedBy,
    blocking: false,
    blocked_by: false,
    muting: false,
    muting_notifications: false,
    requested: r.requested,
    requested_by: r.requestedBy,
    domain_blocking: false,
    endorsed: false,
    note: "",
  };
}
