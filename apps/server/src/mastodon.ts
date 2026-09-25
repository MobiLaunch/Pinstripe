/**
 * Serializers for the Mastodon client API. Field names and shapes follow
 * https://docs.joinmastodon.org/entities/ so any Mastodon client (including
 * ours) can read them.
 */
import type { LocalAccount } from "./store.ts";

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
