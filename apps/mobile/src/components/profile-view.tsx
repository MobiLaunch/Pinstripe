import { type Account, formatHandle, isVideoPost, type Post } from '@pinstripe/core';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { aquaText, Avatar, Group, Pinstripes, Segmented } from '@/components/aqua';
import { confirm } from '@/components/confirm';
import { Icon } from '@/components/icon';
import { initials } from '@/components/initials';
import { NavBar, Spinner } from '@/components/ios6';
import { PostCard } from '@/components/post-card';
import { usePullToRefresh } from '@/components/pull-refresh';
import { Texture } from '@/components/texture';
import { usePostList } from '@/hooks/use-post-list';
import { colors, fontFamily } from '@/theme/aqua';
import { useAccent } from '@/theme/theme';

const TABS = [
  { value: 'videos', label: 'Videos' },
  { value: 'posts', label: 'Posts' },
  { value: 'boosts', label: 'Boosts' },
] as const;

/**
 * A profile: banner, identity, stats and the Videos / Posts / Boosts tabs.
 * Used for your own Account tab and for everyone else's profile.
 */
export function ProfileView({
  account,
  viewerId,
  left,
  right,
  action,
  onRefresh,
  onDeleted,
  notice,
  postsKey = '',
}: {
  account: Account;
  viewerId: string;
  /** Navigation bar buttons: Search and Settings for you, Back for others. */
  left?: ReactNode;
  right?: ReactNode;
  /** Beside the avatar: Edit Profile for you, Follow for others. */
  action: ReactNode;
  onRefresh?: () => void;
  onDeleted?: () => void;
  /** A line under the bio: "You've blocked this account", an error… */
  notice?: string | null;
  /** Changing it reloads the posts (after blocking, say). */
  postsKey?: string;
}) {
  const accent = useAccent();
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('posts');
  // One list of the account's posts and boosts; each tab shows its share.
  const list = usePostList((client, maxId) => client.accountStatuses(account.id, { maxId }), `${account.id}:${postsKey}`, {
    accepts: (post) => post.account.id === account.id,
  });
  const shown = list.posts.filter((p) => (tab === 'boosts' ? !!p.reblog : !p.reblog && (tab === 'posts' || isVideoPost(p))));
  const counts = account.counts;

  const remove = async (post: Post) => {
    if (await confirm('Delete post?', 'This removes it here and asks other servers to remove it too.', 'Delete')) {
      if (await list.remove(post)) onDeleted?.();
    }
  };

  const header = (
    <>
      <LinearGradient colors={accent.banner.colors} locations={accent.banner.locations} style={[styles.banner, { borderBottomColor: accent.bannerEdge }]} />
      <View style={styles.identity}>
        <Avatar framed initials={initials(account.displayName)} size={92} uri={account.avatarUrl} />
        {action}
      </View>
      <View style={styles.body}>
        <Text style={styles.name} accessibilityRole="header">
          {account.displayName}
        </Text>
        <Text style={aquaText.handle}>{formatHandle(account)}</Text>
        {account.bio ? <Text style={[aquaText.body, styles.bio]}>{account.bio}</Text> : null}
        {notice ? (
          <Text style={[aquaText.body, styles.notice]} accessibilityLiveRegion="polite">
            {notice}
          </Text>
        ) : null}
        {account.fields.map((f) => (
          <View key={f.name} style={styles.field}>
            <Text style={styles.fieldName}>{f.name}</Text>
            {f.verifiedAt ? <Icon name="check" size={14} strokeWidth={3} color={colors.verified} /> : null}
            <Text style={[styles.fieldValue, f.verifiedAt && styles.verified]}>{f.value}</Text>
          </View>
        ))}
      </View>
      {counts ? (
        <View style={styles.pad}>
          <Group>
            <View style={styles.stats}>
              <Stat n={counts.posts} label="Posts" />
              <Stat n={counts.following} label="Following" divider />
              <Stat n={counts.followers} label="Followers" divider />
            </View>
          </Group>
        </View>
      ) : null}
      <Segmented options={TABS} value={tab} onChange={setTab} style={[styles.pad, styles.tabs]} />
    </>
  );

  const grid = tab === 'videos';
  const pull = usePullToRefresh(() => {
    onRefresh?.();
    return list.refresh();
  }, list.refreshing && !list.loading);
  return (
    <Pinstripes>
      <NavBar title={account.displayName} left={left} right={right} />
      <FlatList
        // Switching between the grid and the list needs a fresh list (numColumns can't change in place).
        key={grid ? 'grid' : 'list'}
        data={grid ? shelves(shown) : shown.map((p) => [p])}
        keyExtractor={(row) => row.map((p) => p.id).join()}
        ListHeaderComponent={
          <>
            {pull.header}
            {header}
          </>
        }
        contentContainerStyle={styles.list}
        {...pull.listProps}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          list.loading ? (
            <Spinner style={styles.empty} />
          ) : (
            <Text style={[aquaText.handle, styles.empty]}>
              {tab === 'videos' ? 'No videos yet.' : tab === 'posts' ? 'No posts yet.' : 'No boosts yet.'}
            </Text>
          )
        }
        renderItem={({ item: row }) =>
          grid ? (
            <Shelf posts={row} onOpen={(post) => router.push({ pathname: '/videos/[accountId]', params: { accountId: account.id, start: post.id } })} />
          ) : (
          <View style={styles.item}>
            <PostCard
              post={row[0]!}
              viewerId={viewerId}
              onFavourite={(p) => list.toggle(p, 'favourite')}
              onBoost={(p) => list.toggle(p, 'boost')}
              onDelete={remove}
            />
          </View>
          )
        }
      />
    </Pinstripes>
  );
}

const WOOD = require('../../assets/textures/wood.png');
const PER_SHELF = 3;

function shelves(posts: Post[]): Post[][] {
  const rows: Post[][] = [];
  for (let i = 0; i < posts.length; i += PER_SHELF) rows.push(posts.slice(i, i + PER_SHELF));
  return rows;
}

/**
 * One shelf of videos, Newsstand-style: the posters stand against a dark
 * wooden back, on a lit plank with a rounded front edge.
 */
function Shelf({ posts, onOpen }: { posts: Post[]; onOpen: (post: Post) => void }) {
  return (
    <View style={styles.bay}>
      <Texture source={WOOD} tile={{ width: 512, height: 256 }} />
      <View style={styles.bayShade} pointerEvents="none" />
      <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)']} style={styles.bayTop} pointerEvents="none" />
      <View style={styles.bayItems}>
        {Array.from({ length: PER_SHELF }, (_, i) =>
          posts[i] ? <VideoTile key={posts[i].id} post={posts[i]} onPress={() => onOpen(posts[i]!)} /> : <View key={i} style={styles.tileSpace} />,
        )}
      </View>
      <View style={styles.plank}>
        <Texture source={WOOD} tile={{ width: 512, height: 256 }} />
        <LinearGradient
          colors={['rgba(255,230,200,0.45)', 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.1)', 'rgba(0,0,0,0.45)']}
          locations={[0, 0.2, 0.6, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>
    </View>
  );
}

/** A video in the profile grid: its poster and how many have watched it. */
function VideoTile({ post, onPress }: { post: Post; onPress: () => void }) {
  const video = post.media[0]!;
  return (
    <Pressable
      style={styles.tile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${post.content || 'Video'}${post.views !== null ? `, ${post.views} views` : ''}`}>
      <Image
        source={video.previewUrl ? { uri: video.previewUrl } : undefined}
        placeholder={video.blurhash ? { blurhash: video.blurhash } : undefined}
        contentFit="cover"
        style={StyleSheet.absoluteFill}
      />
      {post.views !== null ? (
        <View style={styles.views} pointerEvents="none">
          <Icon name="play" size={11} color="#fff" filled />
          <Text style={styles.viewsText}>{formatCount(post.views)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/** 1234 → "1.2K", as on video apps. */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

function Stat({ n, label, divider = false }: { n: number; label: string; divider?: boolean }) {
  return (
    <View style={[styles.stat, divider && styles.statDivider]}>
      <Text style={styles.statN}>{n.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { height: 110, borderBottomWidth: 1, borderBottomColor: '#0e3f86' },
  identity: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 16, marginTop: -48 },
  body: { paddingHorizontal: 16, paddingTop: 10, gap: 2 },
  name: { fontFamily, fontSize: 20, fontWeight: '700', color: colors.text },
  bio: { marginTop: 8 },
  notice: { marginTop: 10, padding: 10, borderRadius: 6, backgroundColor: '#fff4d6', borderWidth: 1, borderColor: '#d8b24a' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  fieldName: { fontFamily, width: 70, fontSize: 12, fontWeight: '700', color: colors.textSubtle },
  fieldValue: { fontFamily, fontSize: 12, color: colors.text, flexShrink: 1 },
  verified: { color: colors.verified, fontWeight: '700' },
  pad: { marginHorizontal: 16, marginTop: 14 },
  tabs: { marginBottom: 12 },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  statDivider: { borderLeftWidth: 1, borderLeftColor: '#cfcfcf' },
  statN: { fontFamily, fontSize: 17, fontWeight: '700', color: colors.text },
  statLabel: { fontFamily, fontSize: 12, color: colors.textSubtle },
  list: { paddingBottom: 24 },
  item: { paddingHorizontal: 12, marginBottom: 12 },
  bay: { overflow: 'hidden', paddingTop: 16 },
  bayShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(28,12,2,0.62)' },
  bayTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 14 },
  bayItems: { flexDirection: 'row', gap: 12, paddingHorizontal: 14 },
  plank: {
    height: 18,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,225,190,0.55)',
    borderBottomWidth: 1,
    borderBottomColor: '#1c0c02',
    boxShadow: '0 5px 8px rgba(0,0,0,0.55)',
  },
  tileSpace: { flex: 1 },
  tile: {
    flex: 1,
    aspectRatio: 9 / 16,
    backgroundColor: '#1d2a3a',
    overflow: 'hidden',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    boxShadow: '0 4px 6px rgba(0,0,0,0.6)',
  },
  views: { position: 'absolute', left: 6, bottom: 6, flexDirection: 'row', alignItems: 'center', gap: 3 },
  viewsText: { fontFamily, fontSize: 12, fontWeight: '700', color: '#fff', textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  empty: { textAlign: 'center', marginTop: 24 },
});
