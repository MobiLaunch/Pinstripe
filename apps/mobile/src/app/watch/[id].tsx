import { isVideoPost } from '@pinstripe/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Orb } from '@/components/aqua';
import { Icon } from '@/components/icon';
import { Spinner } from '@/components/ios6';
import { usePlaybackPreferences, VideoPage } from '@/components/video-page';
import { target, usePostList } from '@/hooks/use-post-list';
import { colors } from '@/theme/aqua';

/**
 * A video from the timeline, full screen, and then more: swipe up for the
 * next video on the fediverse, as on the Watch tab.
 */
export default function WatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const prefs = usePlaybackPreferences();
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const list = usePostList(
    async (client, maxId) => {
      if (maxId) return client.timeline('federated', { maxId, onlyVideo: true });
      const [first, more] = await Promise.all([client.status(id), client.timeline('federated', { onlyVideo: true }).catch(() => [])]);
      return [first, ...more.filter((s) => s.id !== first.id && s.reblog?.id !== first.id)];
    },
    `watch:${id}`,
  );
  const videos = useMemo(() => list.posts.filter((p) => isVideoPost(target(p))), [list.posts]);

  // FlatList wants this function to stay the same for the list's life.
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index !== undefined && first.index !== null) setActive(first.index);
  }, []);

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
              active={index === active}
              autoplay
              startMuted={prefs.muted}
              onFavourite={() => list.toggle(item, 'favourite')}
              onBoost={() => list.toggle(item, 'boost')}
            />
          )}
        />
      ) : (
        <View style={styles.center}>
          <Spinner color="#fff" />
        </View>
      )}
      <View style={[styles.back, { top: insets.top + 8 }]}>
        <Orb size={48} style={styles.bare} accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
          <Icon name="chevronLeft" color="#fff" />
        </Orb>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.videoBackdrop },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  back: { position: 'absolute', left: 8 },
  bare: { backgroundColor: 'transparent' },
});
