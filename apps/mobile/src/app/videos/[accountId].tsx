import { isVideoPost } from '@pinstripe/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Orb } from '@/components/aqua';
import { Icon } from '@/components/icon';
import { usePlaybackPreferences, VideoPage } from '@/components/video-page';
import { usePostList } from '@/hooks/use-post-list';
import { colors } from '@/theme/aqua';

/** One account's videos, full screen, starting at the one tapped in their profile grid. */
export default function AccountVideosScreen() {
  const { accountId, start } = useLocalSearchParams<{ accountId: string; start?: string }>();
  const insets = useSafeAreaInsets();
  const prefs = usePlaybackPreferences();
  const [height, setHeight] = useState(0);
  const list = usePostList(
    (client, maxId) => client.accountStatuses(accountId, { maxId, onlyVideo: true, excludeReblogs: true }),
    `profile-videos:${accountId}`,
    { accepts: (post) => post.account.id === accountId && isVideoPost(post) },
  );
  const videos = useMemo(() => list.posts.filter((p) => !p.reblog && isVideoPost(p)), [list.posts]);
  const startIndex = Math.max(0, videos.findIndex((v) => v.id === start));
  const [active, setActive] = useState<number | null>(null);
  const current = active ?? startIndex;

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index !== undefined && first.index !== null) setActive(first.index);
  }).current;

  return (
    <View style={styles.root} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {height > 0 && videos.length > 0 ? (
        <FlatList
          data={videos}
          keyExtractor={(p) => p.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          initialScrollIndex={startIndex}
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
              active={index === current}
              autoplay={prefs.autoplay}
              startMuted={prefs.muted}
              onFavourite={() => list.toggle(item, 'favourite')}
              onBoost={() => list.toggle(item, 'boost')}
            />
          )}
        />
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
        </View>
      )}
      <View style={[styles.back, { top: insets.top + 12 }]}>
        <Orb size={44} accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace(`/profile/${accountId}`))}>
          <Icon name="chevronLeft" color="#fff" />
        </Orb>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.videoBackdrop },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', left: 14 },
});
