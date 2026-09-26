import { isVideoPost, type Post } from '@pinstripe/core';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TimelineKind } from '@/api/mastodon';
import { pickVideoFromLibrary } from '@/api/pick-video';
import { ActionMenu } from '@/components/action-menu';
import { GelButton, Orb, Segmented } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { Spinner } from '@/components/ios6';
import { useTabBarInset } from '@/components/tab-bar';
import { usePlaybackPreferences, VideoPage } from '@/components/video-page';
import { target, usePostList } from '@/hooks/use-post-list';
import { colors, fontFamily } from '@/theme/aqua';
import { type as m3Type } from '@/theme/m3';
import { material } from '@/theme/startup';

const TIMELINES = [
  { value: 'home', label: 'Following' },
  { value: 'local', label: 'Local' },
  { value: 'federated', label: 'Federated' },
] as const;

const isVideo = (p: Post) => isVideoPost(target(p));

/**
 * Full-screen short videos, one per swipe, with the action rail: the home
 * screen on iPhone, the Watch tab on Android.
 */
export function VideosScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [timeline, setTimeline] = useState<TimelineKind>('home');
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const prefs = usePlaybackPreferences();
  const bottomInset = useTabBarInset();
  const list = usePostList((client, maxId) => client.timeline(timeline, { maxId, onlyVideo: true }), `videos:${timeline}`, {
    accepts: (post) => isVideo(post) && (timeline === 'home' || post.visibility === 'public'),
  });
  // Servers that don't know only_video send other posts too.
  const videos = list.posts.filter(isVideo);

  // FlatList wants this function to stay the same for the list's life.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index !== undefined && first.index !== null) setActive(first.index);
  }, []);

  const fromLibrary = async () => {
    setError(null);
    const problem = await pickVideoFromLibrary();
    if (problem) setError(problem);
  };

  const [sheetOpen, setSheetOpen] = useState(false);
  const record = () => {
    // On web the file picker is the camera too, so there's nothing to choose.
    if (Platform.OS === 'web') return fromLibrary();
    setSheetOpen(true);
  };

  return (
    <View style={styles.root} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {height > 0 && videos.length > 0 ? (
        <FlatList
          data={videos}
          keyExtractor={(p) => p.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          onEndReached={list.loadMore}
          onEndReachedThreshold={2}
          windowSize={3}
          renderItem={({ item, index }) => (
            <VideoPage
              post={item}
              height={height}
              active={focused && index === active}
              autoplay={prefs.autoplay}
              startMuted={prefs.muted}
              onFavourite={() => list.toggle(item, 'favourite')}
              onBoost={() => list.toggle(item, 'boost')}
              bottomInset={bottomInset}
            />
          )}
        />
      ) : (
        <LinearGradient colors={material ? ['#000000', '#000000'] : ['#3a7cc2', '#123658', '#050d18']} style={styles.stage}>
          {list.loading ? (
            <Spinner color="#fff" />
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>{list.error ? 'Couldn’t load videos' : 'No videos yet'}</Text>
              <Text style={styles.emptyText}>
                {list.error ?? (timeline === 'home' ? 'Follow people or record the first one.' : 'Nothing posted here yet.')}
              </Text>
              <GelButton title="Record a Video" onPress={record} />
            </View>
          )}
        </LinearGradient>
      )}

      {material ? (
        // TikTok's header: words across the top, the chosen one bold and underlined.
        <View style={[styles.header, styles.m3Header, { top: insets.top + 4 }]}>
          <View style={styles.m3Side} />
          <View style={styles.m3Tabs} accessibilityRole="tablist">
            {TIMELINES.map((t) => {
              const on = t.value === timeline;
              return (
                <Pressable key={t.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => setTimeline(t.value)} style={styles.m3Tab}>
                  <Text style={[m3Type.titleMedium, styles.m3TabText, on && styles.m3TabOn]}>{t.value === 'federated' ? 'Everyone' : t.label}</Text>
                  <View style={[styles.m3Underline, on && styles.m3UnderlineOn]} />
                </Pressable>
              );
            })}
          </View>
          <Orb size={48} style={styles.m3Bare} accessibilityLabel="Record a video" onPress={record}>
            <Icon name="camera" size={24} color="#fff" />
          </Orb>
        </View>
      ) : (
        <View style={[styles.header, { top: insets.top + 12 }]}>
          <Segmented options={TIMELINES} value={timeline} onChange={setTimeline} style={styles.flex} />
          <Orb active size={46} accessibilityLabel="Record a video" onPress={record}>
            <Icon name="camera" size={24} color="#fff" />
          </Orb>
        </View>
      )}
      {error ? (
        <View style={[styles.error, { top: insets.top + 70 }]}>
          <FormError message={error} />
        </View>
      ) : null}
      <ActionMenu
        visible={sheetOpen}
        title="New video · up to 60 seconds"
        actions={[
          { label: 'Take Video', onPress: () => router.push('/camera') },
          { label: 'Choose From Library', onPress: fromLibrary },
        ]}
        onClose={() => setSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.videoBackdrop },
  flex: { flex: 1 },
  stage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontFamily, fontSize: 18, fontWeight: '700', color: colors.onVideo },
  emptyText: { fontFamily, fontSize: 14, color: colors.onVideoMuted, textAlign: 'center', marginBottom: 8 },
  header: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  error: { position: 'absolute', left: 16, right: 16 },
  m3Header: { left: 4, right: 4, gap: 0 },
  m3Side: { width: 48 },
  m3Tabs: { flex: 1, flexDirection: 'row', justifyContent: 'center', gap: 4 },
  m3Tab: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, gap: 4 },
  m3TabText: { color: 'rgba(255,255,255,0.7)', textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  m3TabOn: { color: '#ffffff', fontWeight: '800' },
  m3Underline: { width: 24, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
  m3UnderlineOn: { backgroundColor: '#ffffff' },
  m3Bare: { backgroundColor: 'transparent' },
});
