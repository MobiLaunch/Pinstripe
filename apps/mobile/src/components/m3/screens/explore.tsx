/**
 * Search in the Android look. Before you type: trends, as Twitter showed
 * them ("1 · Trending · #synths · 12 people posting"), and a carousel of
 * videos to jump into. As you type: people, anywhere on the fediverse, and
 * the hashtag itself.
 */
import { type Account, formatHandle, isVideoPost, type Post } from '@pinstripe/core';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type MastodonTag, toAccount } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { FormError } from '@/components/form-error';
import { initials } from '@/components/initials';
import { target, usePostList } from '@/hooks/use-post-list';
import { type, useM3 } from '@/theme/m3';

import { DrawerButton } from '../drawer';
import { M3Avatar } from '../kit';
import { LoadingIndicator } from '../loaders';
import { M3Pressable } from '../pressable';
import { Glyph } from '../symbol';

export function M3Explore() {
  const { c } = useM3();
  const { state } = useAuth();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Account[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const q = query.trim();
  const tag = /^#?[\p{L}\p{N}_]+$/u.test(q) ? q.replace(/^#/, '').toLowerCase() : null;

  useEffect(() => {
    if (state.status !== 'signedIn' || q.length < 2) return;
    const run = ++latest.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { accounts } = await state.client.search(q);
        if (run === latest.current) {
          setResults(accounts.map((a) => toAccount(a, state.server)));
          setError(null);
        }
      } catch (e) {
        if (run === latest.current) setError(e instanceof Error ? e.message : 'Search failed.');
      } finally {
        if (run === latest.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [q, state]);

  return (
    <View style={[styles.root, { backgroundColor: c.surface, paddingTop: insets.top }]}>
      <View style={styles.searchWrap}>
        <View style={[styles.search, { backgroundColor: c.surfaceContainerHigh }]}>
          <Glyph name="search" color={c.onSurfaceVariant} />
          <TextInput
            accessibilityLabel="Search"
            placeholder="Search Pinstripe"
            placeholderTextColor={c.onSurfaceVariant}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            value={query}
            onChangeText={setQuery}
            style={[type.bodyLarge, styles.input, { color: c.onSurface }]}
          />
          {query ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear" hitSlop={8} onPress={() => setQuery('')}>
              <Glyph name="close" color={c.onSurfaceVariant} />
            </Pressable>
          ) : (
            <DrawerButton />
          )}
        </View>
      </View>
      {q.length >= 2 ? (
        <FlatList
          data={results}
          keyExtractor={(a) => a.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              <FormError message={error} />
              {tag ? (
                <M3Pressable accessibilityRole="link" content={c.onSurface} onPress={() => router.push({ pathname: '/tag/[name]', params: { name: tag } })} style={styles.item}>
                  <View style={[styles.tagIcon, { backgroundColor: c.secondaryContainer }]}>
                    <Glyph name="tag" color={c.onSecondaryContainer} />
                  </View>
                  <Text style={[type.bodyLarge, { color: c.onSurface }]}>#{tag}</Text>
                </M3Pressable>
              ) : null}
              {searching ? <LoadingIndicator size={36} style={styles.searching} /> : null}
            </>
          }
          ListEmptyComponent={
            searching ? null : <Text style={[type.bodyMedium, styles.none, { color: c.onSurfaceVariant }]}>No people found. Try a full handle, like @name@server.</Text>
          }
          renderItem={({ item }) => (
            <M3Pressable accessibilityRole="link" content={c.onSurface} onPress={() => router.push(`/profile/${item.id}`)} style={styles.item}>
              <M3Avatar initials={initials(item.displayName)} uri={item.avatarUrl} size={40} />
              <View style={styles.flex}>
                <Text style={[type.titleSmall, { color: c.onSurface, fontWeight: '700' }]} numberOfLines={1}>
                  {item.displayName}
                </Text>
                <Text style={[type.bodyMedium, { color: c.onSurfaceVariant }]} numberOfLines={1}>
                  {formatHandle(item)}
                </Text>
              </View>
            </M3Pressable>
          )}
        />
      ) : (
        <Discover />
      )}
    </View>
  );
}

/** Trends and videos, before a search. */
function Discover() {
  const { c } = useM3();
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const [trends, setTrends] = useState<MastodonTag[] | null>(null);
  const videos = usePostList((cl, maxId) => cl.timeline('local', { maxId, onlyVideo: true }), 'explore-videos');
  const shelf = videos.posts.filter((p) => isVideoPost(target(p))).slice(0, 12);

  useEffect(() => {
    client
      ?.trendingTags(10)
      .then(setTrends)
      .catch(() => setTrends([]));
  }, [client]);

  return (
    <ScrollView contentContainerStyle={styles.list}>
      {shelf.length ? (
        <>
          <Text style={[type.titleLarge, styles.heading, { color: c.onSurface }]}>Videos to watch</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel} decelerationRate="fast" snapToInterval={148}>
            {shelf.map((post, i) => (
              <VideoCard key={post.id} post={post} big={i === 0} />
            ))}
          </ScrollView>
        </>
      ) : null}
      <Text style={[type.titleLarge, styles.heading, { color: c.onSurface }]}>Trends for you</Text>
      {trends === null ? (
        <LoadingIndicator size={36} style={styles.searching} />
      ) : trends.length === 0 ? (
        <Text style={[type.bodyMedium, styles.none, { color: c.onSurfaceVariant }]}>No trends yet. Hashtags people use this week show up here.</Text>
      ) : (
        trends.map((t, i) => {
          const people = (t.history ?? []).reduce((n, d) => Math.max(n, Number(d.accounts) || 0), 0);
          const posts = (t.history ?? []).reduce((n, d) => n + (Number(d.uses) || 0), 0);
          return (
            <M3Pressable key={t.name} accessibilityRole="link" content={c.onSurface} onPress={() => router.push({ pathname: '/tag/[name]', params: { name: t.name } })} style={styles.trend}>
              <Text style={[type.bodySmall, { color: c.onSurfaceVariant }]}>{i + 1} · Trending</Text>
              <Text style={[type.titleMedium, { color: c.onSurface, fontWeight: '700' }]}>#{t.name}</Text>
              <Text style={[type.bodySmall, { color: c.onSurfaceVariant }]}>
                {posts.toLocaleString()} {posts === 1 ? 'post' : 'posts'}
                {people > 1 ? ` · ${people.toLocaleString()} people` : ''}
              </Text>
            </M3Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

/** A carousel item: the video's poster, rounded, with who posted it. The first is the hero, wider. */
function VideoCard({ post, big }: { post: Post; big: boolean }) {
  const { c } = useM3();
  const shown = target(post);
  const video = shown.media[0]!;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Video by ${shown.account.displayName}`}
      onPress={() => router.push({ pathname: '/watch/[id]', params: { id: post.id } })}
      style={({ pressed }) => [styles.card, { width: big ? 220 : 140, backgroundColor: c.surfaceContainerHighest, borderRadius: pressed ? 20 : 28 }]}>
      {video.previewUrl ? (
        <Image source={{ uri: video.previewUrl }} placeholder={video.blurhash ? { blurhash: video.blurhash } : undefined} contentFit="cover" style={StyleSheet.absoluteFill} />
      ) : null}
      <View style={styles.cardShade} />
      <View style={styles.cardText}>
        <Glyph name="play_arrow" size={20} color="#ffffff" filled />
        <Text style={[type.labelLarge, styles.cardName]} numberOfLines={1}>
          {shown.account.displayName}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
  search: { height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 4, gap: 12 },
  input: { flex: 1, paddingVertical: 0, outlineWidth: 0 },
  list: { paddingBottom: 96, flexGrow: 1 },
  item: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 8 },
  tagIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  searching: { marginVertical: 16 },
  none: { textAlign: 'center', marginTop: 32, marginHorizontal: 32 },
  heading: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8, fontWeight: '700' },
  carousel: { paddingHorizontal: 16, gap: 8 },
  card: { height: 220, overflow: 'hidden' },
  cardShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 80, backgroundColor: 'rgba(0,0,0,0.35)' },
  cardText: { position: 'absolute', left: 12, right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardName: { color: '#ffffff', flex: 1 },
  trend: { paddingHorizontal: 16, paddingVertical: 10, gap: 2 },
});
