import type { Post } from '@pinstripe/core';
import { Link } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { TimelineKind } from '@/api/mastodon';
import { useAccount, useAuth } from '@/auth/session';
import { aquaText, Avatar, Card, GelButton, Pinstripes, Segmented } from '@/components/aqua';
import { Badge, BarButton, NavBar, Spinner } from '@/components/ios6';
import { confirm } from '@/components/confirm';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { initials } from '@/components/initials';
import { VideosScreen } from '@/components/videos-screen';
import { glassInput } from '@/components/liquid-controls';
import { useM3Surfaces } from '@/components/m3/kit';
import { PickerSheet } from '@/components/picker';
import { PostCard } from '@/components/post-card';
import { ProgressBar } from '@/components/progress-bar';
import { usePullToRefresh } from '@/components/pull-refresh';
import { useTabBarInset } from '@/components/tab-bar';
import { useComposer, VISIBILITIES } from '@/hooks/use-composer';
import { usePostList } from '@/hooks/use-post-list';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import { colors, fontFamily } from '@/theme/aqua';
import { material } from '@/theme/startup';
import { useGlass, useInk } from '@/theme/theme';

const TIMELINES = [
  { value: 'home', label: 'Home' },
  { value: 'local', label: 'Local' },
  { value: 'federated', label: 'Federated' },
] as const;


/**
 * Text and photo posts, Mastodon-style, with a composer on top. On Android
 * this tab is Watch, the full-screen videos (the timeline is Home, index.tsx).
 */
export default function FeedScreen() {
  return material ? <VideosScreen /> : <ClassicFeed />;
}

function ClassicFeed() {
  const me = useAccount();
  const { refreshAccount } = useAuth();
  const [timeline, setTimeline] = useState<TimelineKind>('home');
  const bottomInset = useTabBarInset();
  const list = usePostList((client, maxId) => client.timeline(timeline, { maxId }), timeline, {
    // New posts and boosts appear straight away where they belong: Home gets
    // both, Local and Federated only public posts (never boosts).
    accepts: (post) => timeline === 'home' || (post.visibility === 'public' && !post.reblog),
  });

  const remove = async (post: Post) => {
    if (await confirm('Delete post?', 'This removes it here and asks other servers to remove it too.', 'Delete')) {
      if (await list.remove(post)) refreshAccount();
    }
  };

  const pull = usePullToRefresh(list.refresh, list.refreshing && !list.loading);

  return (
    <Pinstripes>
      <NavBar
        title="Feed"
        left={<NotificationsButton />}
        right={
          <Link href="/search" asChild>
            <BarButton accessibilityLabel="Find people" icon={<Icon name="search" size={16} strokeWidth={2.6} color="#fff" />} />
          </Link>
        }>
        <Segmented variant="bar" options={TIMELINES} value={timeline} onChange={setTimeline} />
      </NavBar>
      <FlatList
        data={list.posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, { paddingBottom: 24 + bottomInset }]}
        {...pull.listProps}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <>
            {pull.header}
            <Composer />
          </>
        }
        ListEmptyComponent={
          list.loading ? (
            <Spinner style={styles.state} />
          ) : list.error ? (
            <View style={styles.state}>
              <FormError message={list.error} />
              <GelButton tone="gray" small title="Try Again" onPress={list.refresh} />
            </View>
          ) : (
            <Text style={[aquaText.handle, styles.empty]}>
              {timeline === 'home' ? 'Nothing here yet. Say hello!' : 'No posts yet.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            viewerId={me.id}
            onFavourite={(p) => list.toggle(p, 'favourite')}
            onBoost={(p) => list.toggle(p, 'boost')}
            onDelete={remove}
          />
        )}
      />
    </Pinstripes>
  );
}

/** The bell, with a count of unread notifications. */
function NotificationsButton() {
  const unread = useUnreadNotifications();
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <View style={styles.bell}>
      <Link href="/notifications" asChild>
        <BarButton accessibilityLabel={label} icon={<Icon name="bell" size={16} strokeWidth={2.6} color="#fff" />} />
      </Link>
      <Badge count={unread} style={styles.unread} />
    </View>
  );
}

function Composer() {
  const ink = useInk();
  const glass = useGlass();
  const m3 = useM3Surfaces();
  const me = useAccount();
  const [choosing, setChoosing] = useState(false);
  const { draft, setDraft, visibility, setVisibility, posting, error, attachments, removeAttachment, remaining, canPost, pickPhotos, submit } = useComposer();
  const current = VISIBILITIES.find((v) => v.value === visibility)!;

  return (
    <Card style={styles.composer}>
      <FormError message={error} />
      <View style={styles.row}>
        <Avatar initials={initials(me.displayName)} />
        <TextInput
          accessibilityLabel="New post"
          placeholder="Share an update with your followers…"
          placeholderTextColor="#767676"
          multiline
          value={draft}
          onChangeText={setDraft}
          style={[styles.input, glass && glassInput, m3.input]}
        />
      </View>
      {attachments.length ? (
        <View style={styles.attachments}>
          {attachments.map((a) => (
            <View key={a.key} style={styles.thumbWrap}>
              <Image source={{ uri: a.uri }} style={styles.thumb} contentFit="cover" accessibilityLabel="Attached photo" />
              {a.media ? null : (
                <View style={styles.thumbProgress}>
                  <ProgressBar progress={a.progress} label="Uploading photo" />
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                hitSlop={10}
                onPress={() => removeAttachment(a.key)}
                style={styles.remove}>
                <Text style={styles.removeText}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.composerBar}>
        <GelButton
          tone="gray"
          small
          accessibilityLabel="Attach photos"
          disabled={attachments.length >= 4}
          onPress={pickPhotos}
          icon={<Icon name="photo" size={18} color={ink.text} />}
        />
        <GelButton
          tone="gray"
          small
          title={current.label}
          accessibilityLabel={`Visibility: ${current.label}. Tap to change.`}
          onPress={() => setChoosing(true)}
        />
        <PickerSheet
          visible={choosing}
          title="Who Can See It"
          options={VISIBILITIES}
          value={visibility}
          onChange={setVisibility}
          onClose={() => setChoosing(false)}
        />
        <Text style={[aquaText.handle, styles.push, remaining < 0 && styles.over]}>{remaining}</Text>
        <GelButton
          small
          title={posting ? 'Posting…' : 'Post'}
          disabled={!canPost}
          onPress={submit}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  bell: { alignSelf: 'flex-start' },
  unread: { position: 'absolute', top: -9, right: -12 },
  list: { padding: 12, gap: 12, flexGrow: 1 },
  composer: { gap: 10 },
  attachments: { flexDirection: 'row', gap: 8, paddingLeft: 50, flexWrap: 'wrap' },
  thumbWrap: { width: 72, height: 72, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#8f8f8f' },
  thumb: { width: '100%', height: '100%' },
  thumbProgress: { position: 'absolute', left: 4, right: 4, bottom: 4 },
  remove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 16, lineHeight: 18, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    minHeight: 76,
    fontFamily,
    fontSize: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#a2a2a2',
    borderTopColor: '#7b7b7b',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.22), 0 1px 0 rgba(255,255,255,0.8)',
    textAlignVertical: 'top',
  },
  composerBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 50 },
  push: { marginLeft: 'auto' },
  over: { color: colors.danger, fontWeight: '700' },
  state: { marginTop: 32, gap: 12, alignItems: 'center' },
  empty: { textAlign: 'center', marginTop: 32 },
});
