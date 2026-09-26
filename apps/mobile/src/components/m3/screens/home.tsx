/**
 * Home in the Android look: a chronological timeline, as Twitter had before
 * the algorithm. The top app bar has your avatar (for the drawer) and the
 * wordmark; tabs pick Following, Local or Everyone; videos in the timeline
 * play as you scroll past; the FAB opens into Post, Record and Upload.
 */
import type { Post } from '@pinstripe/core';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Platform, StyleSheet, Text, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TimelineKind } from '@/api/mastodon';
import { pickVideoFromLibrary } from '@/api/pick-video';
import { useAccount, useAuth } from '@/auth/session';
import { confirm } from '@/components/confirm';
import { FormError } from '@/components/form-error';
import { usePullToRefresh } from '@/components/pull-refresh';
import { usePostList } from '@/hooks/use-post-list';
import { type, useM3 } from '@/theme/m3';

import { DrawerButton } from '../drawer';
import { FabMenu } from '../fab-menu';
import { M3Button, M3Tabs } from '../kit';
import { LoadingIndicator } from '../loaders';
import { PostRow } from '../post-row';

const TIMELINES = [
  { value: 'home', label: 'Following' },
  { value: 'local', label: 'Local' },
  { value: 'federated', label: 'Everyone' },
] as const;

export function M3Home() {
  const { c } = useM3();
  const me = useAccount();
  const { refreshAccount } = useAuth();
  const insets = useSafeAreaInsets();
  const [timeline, setTimeline] = useState<TimelineKind>('home');
  const [playing, setPlaying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const list = usePostList((client, maxId) => client.timeline(timeline, { maxId }), timeline, {
    accepts: (post) => timeline === 'home' || (post.visibility === 'public' && !post.reblog),
  });
  const pull = usePullToRefresh(list.refresh, list.refreshing && !list.loading);

  const remove = async (post: Post) => {
    if (await confirm('Delete post?', 'This removes it here and asks other servers to remove it too.', 'Delete')) {
      if (await list.remove(post)) refreshAccount();
    }
  };

  // The first video mostly on screen plays; FlatList wants this to stay the same.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const video = viewableItems.find((v) => {
      const p = v.item as Post;
      return (p.reblog ?? p).media[0]?.kind === 'video';
    });
    setPlaying(video ? (video.item as Post).id : null);
  }, []);

  const upload = async () => {
    setError(null);
    const problem = await pickVideoFromLibrary();
    if (problem) setError(problem);
  };

  return (
    <View style={[styles.root, { backgroundColor: c.surface }]}>
      <View style={{ paddingTop: insets.top, backgroundColor: c.surface }}>
        <View style={styles.bar}>
          <DrawerButton />
          <Text style={[type.headlineEmphasized, styles.wordmark, { color: c.primary }]} accessibilityRole="header">
            pinstripe
          </Text>
          <View style={styles.barSide} />
        </View>
        <M3Tabs options={TIMELINES} value={timeline} onChange={setTimeline} />
      </View>
      <FlatList
        data={list.posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        {...pull.listProps}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 70 }}
        ListHeaderComponent={
          <>
            {pull.header}
            <FormError message={error} />
          </>
        }
        ListEmptyComponent={
          list.loading ? (
            <LoadingIndicator style={styles.state} />
          ) : list.error ? (
            <View style={styles.state}>
              <FormError message={list.error} />
              <M3Button tone="gray" small title="Try again" onPress={list.refresh} />
            </View>
          ) : (
            <View style={styles.state}>
              <Text style={[type.headlineSmall, { color: c.onSurface, textAlign: 'center' }]}>
                {timeline === 'home' ? 'Welcome to your timeline' : 'Nothing here yet'}
              </Text>
              <Text style={[type.bodyMedium, { color: c.onSurfaceVariant, textAlign: 'center' }]}>
                {timeline === 'home' ? 'Posts and videos from people you follow show up here, newest first.' : 'Be the first to post.'}
              </Text>
              {timeline === 'home' ? <M3Button title="Find people to follow" onPress={() => router.push('/search')} /> : null}
            </View>
          )
        }
        renderItem={({ item }) => (
          <PostRow
            post={item}
            viewerId={me.id}
            playing={item.id === playing}
            onFavourite={(p) => list.toggle(p, 'favourite')}
            onBoost={(p) => list.toggle(p, 'boost')}
            onDelete={remove}
          />
        )}
      />
      <FabMenu
        icon="edit"
        label="New post"
        items={[
          { label: 'Upload video', icon: 'video_library', onPress: upload },
          { label: 'Record video', icon: 'videocam', onPress: () => (Platform.OS === 'web' ? upload() : router.push('/camera')) },
          { label: 'Post', icon: 'edit', onPress: () => router.push('/compose') },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: { height: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  barSide: { width: 48 },
  wordmark: { flex: 1, textAlign: 'center', fontSize: 26, letterSpacing: -0.8 },
  list: { flexGrow: 1, paddingBottom: 96 },
  state: { marginTop: 48, gap: 12, alignItems: 'center', paddingHorizontal: 32 },
});
