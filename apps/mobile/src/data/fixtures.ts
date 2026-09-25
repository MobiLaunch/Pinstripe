/**
 * Demo video from the design canvas, for the Videos tab until video upload
 * exists. Typed against @pinstripe/core like real API data.
 */
import type { Account, Post } from '@pinstripe/core';

function account(username: string, domain: string, displayName: string, bio = ''): Account {
  return {
    id: `${username}@${domain}`,
    username,
    domain,
    uri: `https://${domain}/users/${username}`,
    displayName,
    bio,
    avatarUrl: null,
    bannerUrl: null,
    fields: [],
    bot: false,
    locked: false,
    discoverable: true,
    createdAt: '2026-09-01T00:00:00Z',
    counts: null,
  };
}

function post(id: string, author: Account, content: string, extra: Partial<Post> = {}): Post {
  return {
    id,
    uri: `${author.uri}/posts/${id}`,
    account: author,
    content,
    spoiler: '',
    visibility: 'public',
    media: [],
    tags: [],
    inReplyToId: null,
    reblog: null,
    counts: { replies: 0, boosts: 0, favourites: 0 },
    viewer: { favourited: false, boosted: false },
    createdAt: '2026-09-24T12:00:00Z',
    ...extra,
  };
}

const mira = account('mira', 'tilde.zone', 'Mira Reyes');

export const videos: Post[] = [
  post('v1', mira, 'Brought a 2003 iBook G4 back to life this weekend. That Aqua boot screen still gets me.', {
    tags: ['retrocomputing', 'repair'],
    media: [
      {
        id: 'm1',
        kind: 'video',
        url: '',
        previewUrl: null,
        width: 1080,
        height: 1920,
        duration: 42,
        description: 'An iBook G4 booting up',
        blurhash: null,
      },
    ],
    counts: { replies: 318, boosts: 96, favourites: 2418 },
  }),
];
