/**
 * A small Mastodon API client. The app talks to Pinstripe and to any
 * Mastodon-compatible server through this one client.
 */
import type { Account, MediaAttachment, Post, Visibility } from '@pinstripe/core';

import { htmlToText } from './html';

export interface MastodonAccount {
  id: string;
  username: string;
  acct: string;
  display_name: string;
  locked: boolean;
  bot: boolean;
  discoverable?: boolean | null;
  created_at: string;
  note: string;
  url: string;
  uri?: string;
  avatar: string;
  header: string;
  followers_count: number;
  following_count: number;
  statuses_count: number;
  fields: { name: string; value: string; verified_at: string | null }[];
  /** Pinstripe servers only. */
  pinstripe?: { allow_video_downloads?: boolean };
}

export type MastodonVisibility = 'public' | 'unlisted' | 'private' | 'direct';

export interface MastodonMedia {
  id: string;
  type: 'image' | 'video' | 'gifv' | 'audio' | 'unknown';
  /** Null while a video is still processing. */
  url: string | null;
  preview_url: string | null;
  description: string | null;
  blurhash: string | null;
  meta?: { original?: { width?: number; height?: number; duration?: number } } | null;
}

export interface MastodonStatus {
  id: string;
  uri: string;
  url: string | null;
  created_at: string;
  account: MastodonAccount;
  content: string;
  text?: string;
  visibility: MastodonVisibility;
  sensitive: boolean;
  spoiler_text: string;
  in_reply_to_id: string | null;
  reblog: MastodonStatus | null;
  replies_count: number;
  reblogs_count: number;
  favourites_count: number;
  favourited?: boolean;
  reblogged?: boolean;
  media_attachments: MastodonMedia[];
  tags: { name: string }[];
  mentions: { id: string; username: string; acct: string }[];
  /** Pinstripe servers only. */
  pinstripe?: { views_count?: number };
}

export type TimelineKind = 'home' | 'local' | 'federated';

export type NotificationType = 'mention' | 'reblog' | 'favourite' | 'follow' | 'follow_request' | 'status' | 'poll' | 'update';

export interface MastodonNotification {
  id: string;
  type: NotificationType | string;
  created_at: string;
  account: MastodonAccount;
  status?: MastodonStatus | null;
}

export interface MastodonRelationship {
  id: string;
  following: boolean;
  followed_by: boolean;
  requested: boolean;
  requested_by: boolean;
  blocking?: boolean;
  blocked_by?: boolean;
  muting?: boolean;
  muting_notifications?: boolean;
  domain_blocking?: boolean;
}

export interface MastodonServerBlock {
  id: string;
  domain: string;
  severity: 'silence' | 'suspend';
  public_comment: string | null;
  private_comment: string | null;
  created_at: string;
}

export type ReportCategory = 'spam' | 'legal' | 'violation' | 'other';

/** Mastodon's Admin::Report, as far as the moderation screen uses it. */
export interface MastodonAdminReport {
  id: string;
  action_taken: boolean;
  category: ReportCategory;
  comment: string;
  created_at: string;
  account: { id: string; account: MastodonAccount } | null;
  target_account: { id: string; suspended: boolean; silenced?: boolean; account: MastodonAccount } | null;
  statuses: MastodonStatus[];
}

export interface MastodonCredentialAccount extends MastodonAccount {
  /** Mastodon 4+: moderators and admins have a named role. */
  role?: { name: string; permissions: string } | null;
  source: { privacy: MastodonVisibility; note: string; fields: { name: string; value: string }[]; follow_requests_count: number };
}

export interface PinstripePreferences {
  allow_video_downloads: boolean;
  hide_follower_counts: boolean;
  autoplay_videos: boolean;
  start_muted: boolean;
  save_data_on_cellular: boolean;
  theme: 'blue' | 'graphite';
}

export interface MastodonApp {
  client_id: string;
  client_secret: string;
}

export interface MastodonToken {
  access_token: string;
  scope: string;
  created_at: number;
}

export type FieldErrors = Record<string, { error: string; description: string }[]>;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Per-field problems, from registration's 422 response. */
    readonly details: FieldErrors = {},
  ) {
    super(message);
  }
}

export const SCOPES = 'read write follow push';

/** `mastodon.social`, `https://mastodon.social/` → `https://mastodon.social`. */
export function normalizeServer(input: string): string | null {
  const trimmed = input.trim().replace(/^@?[^@\s]+@(?=[^@]+$)/, ''); // accept a pasted @user@server
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    return url.hostname.includes('.') || url.hostname === 'localhost' ? url.origin : null;
  } catch {
    return null;
  }
}

export class MastodonClient {
  constructor(
    readonly server: string,
    private readonly accessToken?: string,
  ) {}

  withToken(token: string) {
    return new MastodonClient(this.server, token);
  }

  private async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: Record<string, unknown>): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    if (body) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await fetch(`${this.server}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new ApiError(0, `Couldn't reach ${new URL(this.server).host}. Check your connection.`);
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const message = json?.error_description ?? json?.error ?? `Request failed (${res.status})`;
      throw new ApiError(res.status, message, json?.details ?? {});
    }
    return json as T;
  }

  registerApp(redirectUri: string, scopes = SCOPES) {
    return this.request<MastodonApp>('POST', '/api/v1/apps', {
      client_name: 'Pinstripe',
      redirect_uris: redirectUri,
      scopes,
      website: 'https://pinstripe.social',
    });
  }

  token(app: MastodonApp, grant: Record<string, string>) {
    return this.request<MastodonToken>('POST', '/oauth/token', {
      client_id: app.client_id,
      client_secret: app.client_secret,
      ...grant,
    });
  }

  revoke(app: MastodonApp, token: string) {
    return this.request<object>('POST', '/oauth/revoke', {
      client_id: app.client_id,
      client_secret: app.client_secret,
      token,
    });
  }

  /** Needs an app token (client_credentials). */
  register(input: { username: string; email: string; password: string; agreement: boolean; locale: string }) {
    return this.request<MastodonToken>('POST', '/api/v1/accounts', input);
  }

  verifyCredentials() {
    return this.request<MastodonCredentialAccount>('GET', '/api/v1/accounts/verify_credentials');
  }

  updateCredentials(input: {
    display_name?: string;
    note?: string;
    bot?: boolean;
    locked?: boolean;
    discoverable?: boolean;
    fields_attributes?: { name: string; value: string }[];
    source?: { privacy?: MastodonVisibility };
  }) {
    return this.request<MastodonCredentialAccount>('PATCH', '/api/v1/accounts/update_credentials', input);
  }

  /** Pinstripe's own settings; other servers don't have this endpoint. */
  preferences() {
    return this.request<PinstripePreferences>('GET', '/api/v1/pinstripe/preferences');
  }

  updatePreferences(input: Partial<PinstripePreferences>) {
    return this.request<PinstripePreferences>('PATCH', '/api/v1/pinstripe/preferences', input);
  }

  /** Pinstripe only: the sign-in email and whether it's confirmed. */
  login() {
    return this.request<{ email: string; confirmed: boolean }>('GET', '/api/v1/pinstripe/account');
  }

  changePassword(currentPassword: string, password: string) {
    return this.request<object>('POST', '/api/v1/pinstripe/account/password', { current_password: currentPassword, password });
  }

  changeEmail(currentPassword: string, email: string) {
    return this.request<{ email: string; confirmed: boolean }>('POST', '/api/v1/pinstripe/account/email', { current_password: currentPassword, email });
  }

  resendConfirmation() {
    return this.request<object>('POST', '/api/v1/pinstripe/account/confirmation');
  }

  /** No token needed. The answer is the same whether or not the address has an account. */
  requestPasswordReset(email: string) {
    return this.request<object>('POST', '/api/v1/pinstripe/password_reset', { email });
  }

  account(id: string) {
    return this.request<MastodonAccount>('GET', `/api/v1/accounts/${encodeURIComponent(id)}`);
  }

  async relationship(id: string): Promise<MastodonRelationship | null> {
    const [r] = await this.request<MastodonRelationship[]>('GET', `/api/v1/accounts/relationships${query({ 'id[]': id })}`);
    return r ?? null;
  }

  follow(id: string, action: 'follow' | 'unfollow') {
    return this.request<MastodonRelationship>('POST', `/api/v1/accounts/${encodeURIComponent(id)}/${action}`);
  }

  followRequests() {
    return this.request<MastodonAccount[]>('GET', '/api/v1/follow_requests');
  }

  answerFollowRequest(id: string, action: 'authorize' | 'reject') {
    return this.request<MastodonRelationship>('POST', `/api/v1/follow_requests/${encodeURIComponent(id)}/${action}`);
  }

  block(id: string, action: 'block' | 'unblock') {
    return this.request<MastodonRelationship>('POST', `/api/v1/accounts/${encodeURIComponent(id)}/${action}`);
  }

  /** Mutes posts, and notifications too unless `notifications` is false. */
  mute(id: string, options: { notifications?: boolean; durationSeconds?: number } = {}) {
    return this.request<MastodonRelationship>('POST', `/api/v1/accounts/${encodeURIComponent(id)}/mute`, {
      notifications: options.notifications ?? true,
      duration: options.durationSeconds ?? 0,
    });
  }

  unmute(id: string) {
    return this.request<MastodonRelationship>('POST', `/api/v1/accounts/${encodeURIComponent(id)}/unmute`);
  }

  /** Blocked or muted accounts. */
  blockedAccounts(kind: 'blocks' | 'mutes') {
    return this.request<MastodonAccount[]>('GET', `/api/v1/${kind}?limit=80`);
  }

  domainBlocks() {
    return this.request<string[]>('GET', '/api/v1/domain_blocks?limit=200');
  }

  blockDomain(domain: string, action: 'block' | 'unblock') {
    return this.request<object>(action === 'block' ? 'POST' : 'DELETE', '/api/v1/domain_blocks', { domain });
  }

  report(input: { account_id: string; status_ids: string[]; comment: string; category: ReportCategory; forward: boolean }) {
    return this.request<{ id: string }>('POST', '/api/v1/reports', input);
  }

  /** Moderators only. */
  adminReports(options: { resolved?: boolean } = {}) {
    return this.request<MastodonAdminReport[]>('GET', `/api/v1/admin/reports${query({ resolved: options.resolved ? 'true' : undefined })}`);
  }

  resolveReport(id: string) {
    return this.request<MastodonAdminReport>('POST', `/api/v1/admin/reports/${encodeURIComponent(id)}/resolve`);
  }

  /** Moderators: suspend (gone for everyone) or limit ("silence": only followers see them). */
  moderateAccount(accountId: string, type: 'suspend' | 'silence', reportId?: string) {
    return this.request<object>('POST', `/api/v1/admin/accounts/${encodeURIComponent(accountId)}/action`, { type, report_id: reportId });
  }

  serverBlocks() {
    return this.request<MastodonServerBlock[]>('GET', '/api/v1/admin/domain_blocks');
  }

  blockServer(input: { domain: string; severity: 'silence' | 'suspend'; public_comment?: string; private_comment?: string }) {
    return this.request<MastodonServerBlock>('POST', '/api/v1/admin/domain_blocks', input);
  }

  unblockServer(id: string) {
    return this.request<object>('DELETE', `/api/v1/admin/domain_blocks/${encodeURIComponent(id)}`);
  }

  moderationLog() {
    return this.request<{ id: string; action: string; summary: string; created_at: string; moderator: { username: string } | null }[]>(
      'GET',
      '/api/v1/pinstripe/admin/log',
    );
  }

  /** Accounts matching `q`; full handles and URLs are looked up on their servers. */
  search(q: string) {
    return this.request<{ accounts: MastodonAccount[]; statuses: MastodonStatus[] }>(
      'GET',
      `/api/v2/search${query({ q, resolve: 'true', limit: 20 })}`,
    );
  }

  status(id: string) {
    return this.request<MastodonStatus>('GET', `/api/v1/statuses/${encodeURIComponent(id)}`);
  }

  context(id: string) {
    return this.request<{ ancestors: MastodonStatus[]; descendants: MastodonStatus[] }>(
      'GET',
      `/api/v1/statuses/${encodeURIComponent(id)}/context`,
    );
  }

  postStatus(input: { status: string; visibility: MastodonVisibility; in_reply_to_id?: string; spoiler_text?: string; media_ids?: string[] }) {
    return this.request<MastodonStatus>('POST', '/api/v1/statuses', input);
  }

  deleteStatus(id: string) {
    return this.request<MastodonStatus>('DELETE', `/api/v1/statuses/${encodeURIComponent(id)}`);
  }

  /** favourite, unfavourite, reblog, unreblog. */
  statusAction(id: string, action: 'favourite' | 'unfavourite' | 'reblog' | 'unreblog') {
    return this.request<MastodonStatus>('POST', `/api/v1/statuses/${encodeURIComponent(id)}/${action}`);
  }

  /**
   * Newest first; pass the last id you have as `maxId` for the next page.
   * `onlyVideo` asks for posts led by a video (Pinstripe; other servers
   * ignore it, so it also sends Mastodon's `only_media` and the caller filters).
   */
  timeline(kind: TimelineKind, options: { maxId?: string; limit?: number; onlyVideo?: boolean } = {}) {
    const path = { home: '/api/v1/timelines/home', local: '/api/v1/timelines/public', federated: '/api/v1/timelines/public' }[kind];
    return this.request<MastodonStatus[]>(
      'GET',
      path +
        query({
          local: kind === 'local' ? 'true' : undefined,
          max_id: options.maxId,
          limit: options.limit,
          only_media: options.onlyVideo ? 'true' : undefined,
          only_video: options.onlyVideo ? 'true' : undefined,
        }),
    );
  }

  /** Pinstripe: counts this person's view of a video (once each). */
  view(id: string) {
    return this.request<{ views_count: number }>('POST', `/api/v1/pinstripe/statuses/${encodeURIComponent(id)}/view`);
  }

  /** Newest first; `maxId` for older pages. Types the app doesn't show are left out. */
  notifications(options: { maxId?: string; limit?: number } = {}) {
    return this.request<MastodonNotification[]>(
      'GET',
      '/api/v1/notifications' +
        query({
          max_id: options.maxId,
          limit: options.limit,
          'types[]': ['mention', 'reblog', 'favourite', 'follow', 'follow_request'],
        }),
    );
  }

  /**
   * How many notifications arrived since they were last read. Servers
   * without `unread_count` (Mastodon before 4.3) are asked for the ones
   * newer than the read marker instead.
   */
  async unreadNotifications(): Promise<number> {
    try {
      return (await this.request<{ count: number }>('GET', '/api/v1/notifications/unread_count?limit=100')).count;
    } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 404) throw e;
    }
    const markers = await this.request<{ notifications?: { last_read_id: string } }>('GET', '/api/v1/markers?timeline[]=notifications');
    const lastRead = markers.notifications?.last_read_id;
    return (await this.request<MastodonNotification[]>('GET', `/api/v1/notifications${query({ since_id: lastRead, limit: 40 })}`)).length;
  }

  /** Pinstripe: sends notifications to this phone (an Expo push token). */
  registerPush(expoToken: string, platform: string) {
    return this.request<object>('POST', '/api/v1/pinstripe/push', { expo_token: expoToken, platform });
  }

  #pushSupport: Promise<boolean> | null = null;
  /** Whether this server sends Expo pushes (Pinstripe does; Mastodon uses Web Push instead). */
  supportsPush(): Promise<boolean> {
    this.#pushSupport ??= this.preferences().then(
      () => true,
      () => false,
    );
    return this.#pushSupport;
  }

  /** Marks notifications up to `lastReadId` as read, on every device. */
  markNotificationsRead(lastReadId: string) {
    return this.request<object>('POST', '/api/v1/markers', { notifications: { last_read_id: lastReadId } });
  }

  /** Public posts with a hashtag (no #). */
  tagTimeline(tag: string, options: { maxId?: string; onlyVideo?: boolean } = {}) {
    return this.request<MastodonStatus[]>(
      'GET',
      `/api/v1/timelines/tag/${encodeURIComponent(tag)}` +
        query({ max_id: options.maxId, only_media: options.onlyVideo ? 'true' : undefined, only_video: options.onlyVideo ? 'true' : undefined }),
    );
  }

  /** An upload: `url` is null while a video is still processing. */
  media(id: string) {
    return this.request<MastodonMedia>('GET', `/api/v1/media/${encodeURIComponent(id)}`);
  }

  accountStatuses(accountId: string, options: { maxId?: string; excludeReblogs?: boolean; limit?: number; onlyVideo?: boolean } = {}) {
    return this.request<MastodonStatus[]>(
      'GET',
      `/api/v1/accounts/${encodeURIComponent(accountId)}/statuses` +
        query({
          max_id: options.maxId,
          exclude_reblogs: options.excludeReblogs ? 'true' : undefined,
          limit: options.limit,
          only_media: options.onlyVideo ? 'true' : undefined,
          only_video: options.onlyVideo ? 'true' : undefined,
        }),
    );
  }
}

/** A query string; arrays repeat the key (`types[]=a&types[]=b`). */
function query(params: Record<string, string | number | string[] | undefined>): string {
  const pairs = Object.entries(params).flatMap(([k, v]) =>
    v === undefined ? [] : Array.isArray(v) ? v.map((item) => [k, item]) : [[k, String(v)]],
  );
  return pairs.length ? `?${new URLSearchParams(pairs)}` : '';
}

export function toMastodonVisibility(v: Visibility): MastodonVisibility {
  return v === 'followers' ? 'private' : v;
}

export function fromMastodonVisibility(v: MastodonVisibility): Visibility {
  return v === 'private' ? 'followers' : v;
}

function toMedia(m: MastodonMedia): MediaAttachment | null {
  const kind = m.type === 'image' ? 'image' : m.type === 'video' || m.type === 'gifv' ? 'video' : null;
  if (!kind || !m.url) return null;
  const original = m.meta?.original;
  return {
    id: m.id,
    kind,
    url: m.url,
    previewUrl: m.preview_url,
    width: original?.width ?? null,
    height: original?.height ?? null,
    duration: original?.duration ?? null,
    description: m.description ?? '',
    blurhash: m.blurhash,
  };
}

export function toPost(json: MastodonStatus, server: string): Post {
  return {
    id: json.id,
    uri: json.uri,
    account: toAccount(json.account, server),
    content: htmlToText(json.content),
    spoiler: json.spoiler_text,
    visibility: fromMastodonVisibility(json.visibility),
    media: json.media_attachments.map(toMedia).filter((m): m is MediaAttachment => !!m),
    tags: json.tags.map((t) => t.name),
    // `acct` has no domain for accounts on the same server as the one answering.
    mentions: (json.mentions ?? []).map((m) => ({ id: m.id, username: m.username, domain: m.acct.split('@')[1] ?? new URL(server).host })),
    inReplyToId: json.in_reply_to_id,
    reblog: json.reblog ? toPost(json.reblog, server) : null,
    counts: { replies: json.replies_count, boosts: json.reblogs_count, favourites: json.favourites_count },
    views: json.pinstripe?.views_count ?? null,
    viewer:
      json.favourited === undefined ? null : { favourited: !!json.favourited, boosted: !!json.reblogged },
    createdAt: json.created_at,
  };
}

/** Mastodon JSON → the app's own model. `server` is the origin the account was fetched from. */
export function toAccount(json: MastodonAccount, server: string): Account {
  const [, remoteDomain] = json.acct.split('@');
  const domain = remoteDomain ?? new URL(server).host;
  return {
    id: json.id,
    username: json.username,
    domain,
    uri: json.uri ?? json.url,
    displayName: json.display_name || json.username,
    bio: htmlToText(json.note),
    avatarUrl: json.avatar && !json.avatar.includes('/missing.png') ? json.avatar : null,
    bannerUrl: json.header && !json.header.includes('/missing.png') ? json.header : null,
    fields: json.fields.map((f) => ({ name: f.name, value: htmlToText(f.value), verifiedAt: f.verified_at })),
    bot: json.bot,
    locked: json.locked,
    discoverable: json.discoverable ?? false,
    allowsVideoDownloads: json.pinstripe?.allow_video_downloads ?? false,
    createdAt: json.created_at,
    counts: { posts: json.statuses_count, following: json.following_count, followers: json.followers_count },
  };
}
