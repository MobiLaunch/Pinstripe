/**
 * Demo content from the design canvas, typed against @pinstripe/core so the
 * screens are ready for real API data. Replace with API calls as endpoints land.
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
const jonah = account('jonah', 'mastodon.social', 'Jonah Park');
const ada = account('ada', 'pixelfed.social', 'Ada Okafor');
const news = account('news', 'pinstripe.social', 'Pinstripe');

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

export const feed: Post[] = [
  post('a', jonah, 'Anyone else keep a shelf of old PowerBooks just because they look incredible? Asking for a friend. The friend is me.', {
    counts: { replies: 12, boosts: 4, favourites: 38 },
  }),
  post('b', ada, 'Golden hour on the lake. Shot on a 2006 point-and-shoot, zero edits.', {
    media: [
      { id: 'm2', kind: 'image', url: '', previewUrl: null, width: null, height: null, duration: null, description: 'A lake at golden hour', blurhash: null },
    ],
    counts: { replies: 5, boosts: 21, favourites: 140 },
  }),
  post('c', news, 'Welcome aboard. Everything you post here federates to Mastodon, Pixelfed, Misskey and anything else that speaks ActivityPub.', {
    counts: { replies: 31, boosts: 88, favourites: 402 },
  }),
];
