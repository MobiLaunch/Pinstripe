import type { Post } from '@pinstripe/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { type MastodonClient, type MastodonStatus, toPost } from '@/api/mastodon';
import { useAuth } from '@/auth/session';

const PAGE = 20;

/**
 * Every mounted list hears about changes made anywhere in the app, so a post
 * favourited or deleted on Account also changes on Feed (the tabs stay mounted).
 */
type PostEvent =
  | { type: 'updated'; post: Post }
  | { type: 'removed'; id: string }
  | { type: 'created'; post: Post }
  /** Someone's boost of `originalId` was undone. */
  | { type: 'unboosted'; originalId: string; accountId: string };
const listeners = new Set<(event: PostEvent) => void>();
export function publishPostEvent(event: PostEvent) {
  for (const listener of listeners) listener(event);
}

type Loader = (client: MastodonClient, maxId?: string) => Promise<MastodonStatus[]>;

/** Applies `fn` to a post wherever it appears: on its own or inside someone's boost. */
function mapPost(posts: Post[], id: string, fn: (p: Post) => Post): Post[] {
  return posts.map((p) => {
    if (p.id === id) return fn(p);
    if (p.reblog?.id === id) return { ...p, reblog: fn(p.reblog) };
    return p;
  });
}

/** The post the actions act on: the original, for a boost. */
export const target = (p: Post) => p.reblog ?? p;

/**
 * A paged list of posts from the signed-in server, with pull-to-refresh,
 * infinite scroll, and optimistic favourites, boosts and deletes that roll
 * back if the server says no.
 */
export function usePostList(load: Loader, key: string, options: { accepts?: (post: Post) => boolean } = {}) {
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const server = state.status === 'signedIn' ? state.server : '';
  const viewerId = state.status === 'signedIn' ? state.account.id : '';

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const loadingMore = useRef(false);
  // Ignores responses for a list we've since switched away from.
  const generation = useRef(0);

  const fetchPage = useCallback(
    async (maxId?: string) => {
      if (!client) return [];
      return (await load(client, maxId)).map((s) => toPost(s, server));
    },
    // `key` stands in for `load`, which callers usually create inline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, server, key],
  );

  const refresh = useCallback(async () => {
    const gen = ++generation.current;
    setRefreshing(true);
    try {
      const page = await fetchPage();
      if (gen !== generation.current) return;
      setPosts(page);
      setHasMore(page.length >= PAGE);
      setError(null);
    } catch (e) {
      if (gen === generation.current) setError(e instanceof Error ? e.message : 'Couldn’t load posts.');
    } finally {
      if (gen === generation.current) {
        setRefreshing(false);
        setLoading(false);
      }
    }
  }, [fetchPage]);

  useEffect(() => {
    setLoading(true);
    setPosts([]);
    refresh();
  }, [refresh]);

  const accepts = useRef(options.accepts);
  accepts.current = options.accepts;
  useEffect(() => {
    const listener = (event: PostEvent) => {
      if (event.type === 'updated') setPosts((ps) => mapPost(ps, event.post.id, () => event.post));
      else if (event.type === 'removed') setPosts((ps) => ps.filter((p) => p.id !== event.id && p.reblog?.id !== event.id));
      else if (event.type === 'unboosted')
        setPosts((ps) => ps.filter((p) => !(p.reblog?.id === event.originalId && p.account.id === event.accountId)));
      else if (accepts.current?.(event.post)) setPosts((ps) => (ps.some((p) => p.id === event.post.id) ? ps : [event.post, ...ps]));
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const loadMore = useCallback(async () => {
    const last = posts.at(-1);
    if (!last || !hasMore || loadingMore.current) return;
    loadingMore.current = true;
    const gen = generation.current;
    try {
      const page = await fetchPage(last.id);
      if (gen !== generation.current) return;
      setPosts((current) => [...current, ...page.filter((p) => !current.some((c) => c.id === p.id))]);
      setHasMore(page.length >= PAGE);
    } catch {
      // Scrolling again retries.
    } finally {
      loadingMore.current = false;
    }
  }, [posts, hasMore, fetchPage]);

  /** Optimistic toggle; the server's answer replaces the guess, a failure restores the old post. */
  const toggle = useCallback(
    async (post: Post, kind: 'favourite' | 'boost') => {
      if (!client) return;
      const t = target(post);
      const on = kind === 'favourite' ? !!t.viewer?.favourited : !!t.viewer?.boosted;
      const counter = kind === 'favourite' ? 'favourites' : 'boosts';
      const flag = kind === 'favourite' ? 'favourited' : 'boosted';
      const guess: Post = {
        ...t,
        counts: { ...t.counts, [counter]: Math.max(0, t.counts[counter] + (on ? -1 : 1)) },
        viewer: { favourited: !!t.viewer?.favourited, boosted: !!t.viewer?.boosted, [flag]: !on },
      };
      publishPostEvent({ type: 'updated', post: guess });
      try {
        const action = kind === 'favourite' ? (on ? 'unfavourite' : 'favourite') : on ? 'unreblog' : 'reblog';
        const res = await client.statusAction(t.id, action);
        // A reblog returns the new boost wrapping the original.
        publishPostEvent({ type: 'updated', post: toPost(res.reblog ?? res, server) });
        if (action === 'reblog') publishPostEvent({ type: 'created', post: toPost(res, server) });
        if (action === 'unreblog') publishPostEvent({ type: 'unboosted', originalId: t.id, accountId: viewerId });
      } catch {
        publishPostEvent({ type: 'updated', post: t });
      }
    },
    [client, server, viewerId],
  );

  /** Deletes after the server agrees, so a failure leaves nothing to undo. */
  const remove = useCallback(
    async (post: Post) => {
      if (!client) return false;
      try {
        await client.deleteStatus(post.id);
        publishPostEvent({ type: 'removed', id: post.id });
        return true;
      } catch {
        return false;
      }
    },
    [client],
  );

  return { posts, loading, refreshing, error, hasMore, refresh, loadMore, toggle, remove };
}
