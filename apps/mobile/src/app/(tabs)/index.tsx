import { isVideoPost, type Post } from '@pinstripe/core';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, StyleSheet, Text, View, type ViewToken } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TimelineKind } from '@/api/mastodon';
import { checkPicked } from '@/api/upload';
import { ActionMenu } from '@/components/action-menu';
import { GelButton, Orb, Segmented } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { usePlaybackPreferences, VideoPage } from '@/components/video-page';
import { target, usePostList } from '@/hooks/use-post-list';
import { colors, fontFamily } from '@/theme/aqua';

const TIMELINES = [
  { value: 'home', label: 'Following' },
  { value: 'local', label: 'Local' },
  { value: 'federated', label: 'Federated' },
] as const;

const isVideo = (p: Post) => isVideoPost(target(p));

/** Home: full-screen short videos, one per swipe, with the action rail. */
export default function VideosScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const [timeline, setTimeline] = useState<TimelineKind>('home');
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const prefs = usePlaybackPreferences();
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

  const newVideo = async (source: 'camera' | 'library') => {
    setError(null);
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['videos'],
      videoMaxDuration: 60,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.High,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    };
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return setError('Pinstripe needs the camera to record. You can allow it in Settings.');
    }
    const result = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const problem = checkPicked(asset);
    if (problem) return setError(problem);
    const { uri, type, mimeType, fileSize, width, height: h, duration, fileName } = asset;
    router.push({ pathname: '/new-video', params: { asset: JSON.stringify({ uri, type, mimeType, fileSize, width, height: h, duration, fileName }) } });
  };

  const [sheetOpen, setSheetOpen] = useState(false);
  const record = () => {
    // On web the file picker is the camera too, so there's nothing to choose.
    if (Platform.OS === 'web') return newVideo('library');
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
            />
          )}
        />
      ) : (
        <LinearGradient colors={['#3a7cc2', '#123658', '#050d18']} style={styles.stage}>
          {list.loading ? (
            <ActivityIndicator color="#fff" />
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

      <View style={[styles.header, { top: insets.top + 12 }]}>
        <Segmented options={TIMELINES} value={timeline} onChange={setTimeline} style={styles.flex} />
        <Orb active size={46} accessibilityLabel="Record a video" onPress={record}>
          <Icon name="camera" size={24} color="#fff" />
        </Orb>
      </View>
      {error ? (
        <View style={[styles.error, { top: insets.top + 70 }]}>
          <FormError message={error} />
        </View>
      ) : null}
      <ActionMenu
        visible={sheetOpen}
        title="New video · up to 60 seconds"
        actions={[
          { label: 'Take Video', onPress: () => newVideo('camera') },
          { label: 'Choose From Library', onPress: () => newVideo('library') },
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
});
