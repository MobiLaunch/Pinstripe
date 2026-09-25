import { formatHandle, type Post } from '@pinstripe/core';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useIsFocused } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { TimelineKind } from '@/api/mastodon';
import { checkPicked } from '@/api/upload';
import { useAuth } from '@/auth/session';
import { Avatar, GelButton, Orb, Segmented } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { initials } from '@/components/initials';
import { target, usePostList } from '@/hooks/use-post-list';
import { colors, fontFamily, gradients } from '@/theme/aqua';

const TIMELINES = [
  { value: 'home', label: 'Following' },
  { value: 'local', label: 'Local' },
  { value: 'federated', label: 'Federated' },
] as const;

const isVideoPost = (p: Post) => target(p).media[0]?.kind === 'video';

/** Playback preferences from Settings (Pinstripe servers; defaults elsewhere). */
function usePlaybackPreferences() {
  const { state } = useAuth();
  const [prefs, setPrefs] = useState({ autoplay: true, muted: false });
  useEffect(() => {
    if (state.status !== 'signedIn') return;
    state.client
      .preferences()
      .then((p) => setPrefs({ autoplay: p.autoplay_videos, muted: p.start_muted }))
      .catch(() => {});
  }, [state]);
  return prefs;
}

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
    accepts: (post) => isVideoPost(post) && (timeline === 'home' || post.visibility === 'public'),
  });
  // Servers that don't know only_video send other posts too.
  const videos = list.posts.filter(isVideoPost);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index !== undefined && first.index !== null) setActive(first.index);
  }).current;

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

  const record = () => {
    // No action sheet on web; there the library is the camera too.
    if (Platform.OS === 'web') return newVideo('library');
    Alert.alert('New video', 'Up to 60 seconds.', [
      { text: 'Record', onPress: () => newVideo('camera') },
      { text: 'Choose from Library', onPress: () => newVideo('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
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
    </View>
  );
}

function VideoPage({
  post,
  height,
  active,
  autoplay,
  startMuted,
  onFavourite,
  onBoost,
}: {
  post: Post;
  height: number;
  active: boolean;
  autoplay: boolean;
  startMuted: boolean;
  onFavourite: () => void;
  onBoost: () => void;
}) {
  const shown = target(post);
  const video = shown.media[0]!;
  const [started, setStarted] = useState(false);
  const player = useVideoPlayer(video.url, (p) => {
    p.loop = true;
    p.muted = startMuted;
    p.timeUpdateEventInterval = 0.25;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { currentTime } = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const { muted } = useEvent(player, 'mutedChange', { muted: player.muted });

  // The visible video plays (if autoplay is on or it was started by hand); the rest pause.
  useEffect(() => {
    if (active && (autoplay || started)) player.play();
    else player.pause();
  }, [active, autoplay, started, player]);

  const togglePlay = () => {
    if (isPlaying) player.pause();
    else {
      setStarted(true);
      player.play();
    }
  };
  const favourited = !!shown.viewer?.favourited;
  const boosted = !!shown.viewer?.boosted;
  const boostable = shown.visibility === 'public' || shown.visibility === 'unlisted';
  const progress = video.duration ? Math.min(1, currentTime / video.duration) : 0;

  return (
    <View style={[styles.page, { height }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={togglePlay} accessibilityRole="button" accessibilityLabel={isPlaying ? 'Pause' : 'Play'}>
        {video.previewUrl && !isPlaying && currentTime === 0 ? (
          <Image source={{ uri: video.previewUrl }} placeholder={video.blurhash ? { blurhash: video.blurhash } : undefined} contentFit="cover" style={StyleSheet.absoluteFill} />
        ) : null}
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        {!isPlaying ? (
          <View style={styles.paused} pointerEvents="none">
            <Orb active size={64} accessibilityElementsHidden>
              <Icon name="play" size={30} color="#fff" filled />
            </Orb>
          </View>
        ) : null}
      </Pressable>
      <LinearGradient colors={gradients.videoScrim.colors} style={styles.scrim} pointerEvents="none" />

      <View style={styles.rail}>
        <Pressable accessibilityRole="link" accessibilityLabel={`${shown.account.displayName}'s profile`} onPress={() => router.push(`/profile/${shown.account.id}`)}>
          <Avatar initials={initials(shown.account.displayName)} size={52} uri={shown.account.avatarUrl} />
        </Pressable>
        <RailAction label={shown.counts.favourites.toLocaleString()}>
          <Orb active={favourited} accessibilityLabel={favourited ? 'Unlike' : 'Like'} accessibilityState={{ selected: favourited }} onPress={onFavourite}>
            <Icon name="heart" size={24} color="#fff" filled={favourited} />
          </Orb>
        </RailAction>
        <RailAction label={shown.counts.replies.toLocaleString()}>
          <Orb accessibilityLabel="Comments" onPress={() => router.push(`/status/${shown.id}`)}>
            <Icon name="comment" size={24} color="#fff" />
          </Orb>
        </RailAction>
        <RailAction label={shown.counts.boosts.toLocaleString()}>
          <Orb active={boosted} accessibilityLabel={boosted ? 'Undo boost' : 'Boost'} accessibilityState={{ selected: boosted, disabled: !boostable }} disabled={!boostable} onPress={onBoost}>
            <Icon name="boost" size={24} color="#fff" />
          </Orb>
        </RailAction>
        <RailAction label={muted ? 'Muted' : 'Sound'}>
          <Orb accessibilityLabel={muted ? 'Unmute' : 'Mute'} onPress={() => (player.muted = !muted)}>
            <Icon name={muted ? 'soundOff' : 'sound'} size={24} color="#fff" />
          </Orb>
        </RailAction>
        <RailAction label="Share">
          <Orb accessibilityLabel="Share" onPress={() => Share.share({ message: shown.uri, url: shown.uri }).catch(() => {})}>
            <Icon name="share" size={24} color="#fff" />
          </Orb>
        </RailAction>
      </View>

      <View style={styles.caption}>
        {post.reblog ? <Text style={styles.boosted}>Boosted by {post.account.displayName}</Text> : null}
        <Text style={styles.name} onPress={() => router.push(`/profile/${shown.account.id}`)}>
          {shown.account.displayName} <Text style={styles.handle}>{formatHandle(shown.account)}</Text>
        </Text>
        {shown.content ? (
          <Text style={styles.body} numberOfLines={4}>
            {shown.content}
          </Text>
        ) : null}
      </View>
      <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel="Playback" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
}

function RailAction({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.action}>
      {children}
      <Text style={styles.count}>{label}</Text>
    </View>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 };

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.videoBackdrop },
  flex: { flex: 1 },
  stage: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', gap: 12, paddingHorizontal: 32 },
  emptyTitle: { fontFamily, fontSize: 18, fontWeight: '700', color: colors.onVideo },
  emptyText: { fontFamily, fontSize: 14, color: colors.onVideoMuted, textAlign: 'center', marginBottom: 8 },
  page: { width: '100%', backgroundColor: '#000' },
  paused: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 340 },
  header: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  error: { position: 'absolute', left: 16, right: 16 },
  rail: { position: 'absolute', right: 12, bottom: 48, alignItems: 'center', gap: 12 },
  action: { alignItems: 'center' },
  count: { fontFamily, fontSize: 12, fontWeight: '700', color: colors.onVideo, marginTop: 4, ...shadow },
  caption: { position: 'absolute', left: 16, right: 84, bottom: 34, gap: 6 },
  boosted: { fontFamily, fontSize: 12, color: colors.onVideoMuted, ...shadow },
  name: { fontFamily, fontSize: 16, fontWeight: '700', color: colors.onVideo, ...shadow },
  handle: { fontSize: 12, fontWeight: '400', color: colors.onVideoMuted },
  body: { fontFamily, fontSize: 14, lineHeight: 20, color: colors.onVideo, ...shadow },
  progress: { position: 'absolute', left: 16, right: 16, bottom: 14, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#8ac3ff' },
});
