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
}

export type MastodonVisibility = 'public' | 'unlisted' | 'private' | 'direct';

export interface MastodonMedia {
  id: string;
  type: 'image' | 'video' | 'gifv' | 'audio' | 'unknown';
  url: string;
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
}

export type TimelineKind = 'home' | 'local' | 'federated';

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

  private async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Record<string, unknown>): Promise<T> {
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

  registerApp(redirectUri: string) {
    return this.request<MastodonApp>('POST', '/api/v1/apps', {
      client_name: 'Pinstripe',
      redirect_uris: redirectUri,
      scopes: SCOPES,
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
    return this.request<MastodonAccount>('GET', '/api/v1/accounts/verify_credentials');
  }

  postStatus(input: { status: string; visibility: MastodonVisibility; in_reply_to_id?: string; spoiler_text?: string }) {
    return this.request<MastodonStatus>('POST', '/api/v1/statuses', input);
  }

  deleteStatus(id: string) {
    return this.request<MastodonStatus>('DELETE', `/api/v1/statuses/${encodeURIComponent(id)}`);
  }

  /** favourite, unfavourite, reblog, unreblog. */
  statusAction(id: string, action: 'favourite' | 'unfavourite' | 'reblog' | 'unreblog') {
    return this.request<MastodonStatus>('POST', `/api/v1/statuses/${encodeURIComponent(id)}/${action}`);
  }

  /** Newest first; pass the last id you have as `maxId` for the next page. */
  timeline(kind: TimelineKind, options: { maxId?: string; limit?: number } = {}) {
    const path = { home: '/api/v1/timelines/home', local: '/api/v1/timelines/public', federated: '/api/v1/timelines/public' }[kind];
    return this.request<MastodonStatus[]>('GET', path + query({ local: kind === 'local' ? 'true' : undefined, max_id: options.maxId, limit: options.limit }));
  }

  accountStatuses(accountId: string, options: { maxId?: string; excludeReblogs?: boolean; limit?: number } = {}) {
    return this.request<MastodonStatus[]>(
      'GET',
      `/api/v1/accounts/${encodeURIComponent(accountId)}/statuses` +
        query({ max_id: options.maxId, exclude_reblogs: options.excludeReblogs ? 'true' : undefined, limit: options.limit }),
    );
  }
}

function query(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string | number][];
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
}

export function toMastodonVisibility(v: Visibility): MastodonVisibility {
  return v === 'followers' ? 'private' : v;
}

export function fromMastodonVisibility(v: MastodonVisibility): Visibility {
  return v === 'private' ? 'followers' : v;
}

function toMedia(m: MastodonMedia): MediaAttachment | null {
  const kind = m.type === 'image' ? 'image' : m.type === 'video' || m.type === 'gifv' ? 'video' : null;
  if (!kind) return null;
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
    inReplyToId: json.in_reply_to_id,
    reblog: json.reblog ? toPost(json.reblog, server) : null,
    counts: { replies: json.replies_count, boosts: json.reblogs_count, favourites: json.favourites_count },
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
    createdAt: json.created_at,
    counts: { posts: json.statuses_count, following: json.following_count, followers: json.followers_count },
  };
}
