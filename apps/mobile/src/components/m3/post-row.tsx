/**
 * A post in the Android timeline, laid out like classic Twitter: avatar on
 * the left; name, @handle and time on one line; the text; media with round
 * corners; then reply, boost (green when yours), like (red, and it pops)
 * and share spread across the bottom. Rows are divided by a hairline, not
 * boxed in cards.
 *
 * Videos play inline, muted, while they're on screen; tapping one opens it
 * full screen in the vertical, swipe-for-the-next player.
 */
import { formatHandle, isVideoPost, type MediaAttachment, type Post } from '@pinstripe/core';
import { useEvent } from 'expo';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { memo, useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionMenu } from '@/components/action-menu';
import { flashHud } from '@/components/hud';
import { initials } from '@/components/initials';
import { MediaGrid } from '@/components/media-grid';
import { relativeTime } from '@/components/relative-time';
import { RichText } from '@/components/rich-text';
import { ShareSheet } from '@/components/share-sheet';
import { alpha, type, useM3 } from '@/theme/m3';

import { M3Avatar } from './kit';
import { M3Pressable } from './pressable';
import { Glyph, type SymbolName } from './symbol';

export interface PostRowProps {
  post: Post;
  viewerId: string;
  onFavourite: (post: Post) => void;
  onBoost: (post: Post) => void;
  onDelete: (post: Post) => void;
  /** This row's video is the one on screen: it plays (muted). */
  playing?: boolean;
  /** The post a thread is about: bigger text, not a link to itself. */
  focused?: boolean;
}

export const PostRow = memo(function PostRow({ post, viewerId, onFavourite, onBoost, onDelete, playing = false, focused = false }: PostRowProps) {
  const { c } = useM3();
  const shown = post.reblog ?? post;
  const [revealed, setRevealed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [sharing, setSharing] = useState(false);
  const favourited = !!shown.viewer?.favourited;
  const boosted = !!shown.viewer?.boosted;
  const boostable = shown.visibility === 'public' || shown.visibility === 'unlisted';
  const mine = shown.account.id === viewerId && !post.reblog;
  const openProfile = () => router.push(`/profile/${shown.account.id}`);
  const openThread = () => router.push(`/status/${shown.id}`);
  const hidden = !!shown.spoiler && !revealed;

  return (
    <M3Pressable
      content={c.onSurface}
      onPress={focused ? undefined : openThread}
      disabled={focused}
      accessibilityHint={focused ? undefined : 'Opens the thread'}
      style={[styles.row, { borderBottomColor: c.outlineVariant }]}>
      {post.reblog ? (
        <View style={styles.context}>
          <Glyph name="repeat" size={16} color={c.onSurfaceVariant} />
          <Text style={[type.labelMedium, { color: c.onSurfaceVariant }]} numberOfLines={1}>
            {post.account.displayName} boosted
          </Text>
        </View>
      ) : null}
      <View style={styles.body}>
        <Pressable accessibilityRole="link" accessibilityLabel={`${shown.account.displayName}'s profile`} onPress={openProfile}>
          <M3Avatar initials={initials(shown.account.displayName)} uri={shown.account.avatarUrl} size={48} />
        </Pressable>
        <View style={styles.main}>
          <View style={styles.meta}>
            <Text style={[type.titleSmall, styles.name, { color: c.onSurface }]} numberOfLines={1} onPress={openProfile}>
              {shown.account.displayName}
            </Text>
            {shown.account.bot ? <Glyph name="verified" size={16} color={c.primary} /> : null}
            <Text style={[type.bodyMedium, styles.handle, { color: c.onSurfaceVariant }]} numberOfLines={1}>
              {formatHandle(shown.account)} · {relativeTime(shown.createdAt)}
            </Text>
            {shown.visibility === 'followers' || shown.visibility === 'direct' ? <Glyph name="lock" size={14} color={c.onSurfaceVariant} /> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="More" hitSlop={10} onPress={() => setMenu(true)} style={styles.more}>
              <Glyph name="more_vert" size={18} color={c.onSurfaceVariant} />
            </Pressable>
          </View>

          {shown.spoiler ? (
            <Pressable accessibilityRole="button" onPress={() => setRevealed(!revealed)} style={[styles.spoiler, { backgroundColor: c.surfaceContainerHigh }]}>
              <Text style={[type.bodyMedium, { color: c.onSurface, flex: 1 }]}>{shown.spoiler}</Text>
              <Text style={[type.labelLarge, { color: c.primary }]}>{revealed ? 'Hide' : 'Show'}</Text>
            </Pressable>
          ) : null}
          {!hidden && shown.content ? (
            <RichText post={shown} style={[focused ? type.bodyLarge : type.bodyMedium, styles.text, { color: c.onSurface }, focused && styles.focusedText]} selectable={focused} />
          ) : null}
          {!hidden ? isVideoPost(shown) ? <InlineVideo post={shown} video={shown.media[0]!} playing={playing} /> : <MediaGrid media={shown.media} /> : null}

          <View style={styles.actions}>
            <Action icon="mode_comment" label="Reply" count={shown.counts.replies} onPress={() => router.push(`/status/${shown.id}?reply=1`)} />
            <Action
              icon="repeat"
              label={boosted ? 'Undo boost' : 'Boost'}
              count={shown.counts.boosts}
              on={boosted}
              onColor={c.boost}
              disabled={!boostable}
              onPress={() => onBoost(post)}
            />
            <Action
              icon="favorite"
              label={favourited ? 'Unlike' : 'Like'}
              count={shown.counts.favourites}
              on={favourited}
              onColor={c.like}
              pop
              onPress={() => onFavourite(post)}
            />
            <Action icon="share" label="Share" onPress={() => setSharing(true)} />
          </View>
        </View>
      </View>
      <ActionMenu
        visible={menu}
        onClose={() => setMenu(false)}
        actions={[
          {
            label: 'Copy link',
            onPress: async () => {
              await Clipboard.setStringAsync(shown.uri);
              flashHud('Link copied');
            },
          },
          ...(mine
            ? [{ label: 'Delete post', destructive: true, onPress: () => onDelete(post) }]
            : [{ label: `Report ${shown.account.displayName}`, destructive: true, onPress: () => router.push(`/report/${shown.account.id}`) }]),
        ]}
      />
      <ShareSheet visible={sharing} url={shown.uri} text={`${shown.account.displayName} on Pinstripe`} onClose={() => setSharing(false)} />
    </M3Pressable>
  );
});

function Action({
  icon,
  label,
  count,
  on = false,
  onColor,
  disabled = false,
  pop = false,
  onPress,
}: {
  icon: SymbolName;
  label: string;
  count?: number;
  on?: boolean;
  onColor?: string;
  disabled?: boolean;
  /** The like's pop: a quick swell when it turns on. */
  pop?: boolean;
  onPress: () => void;
}) {
  const { c } = useM3();
  const [scale] = useState(() => new Animated.Value(1));
  const [was, setWas] = useState(on);
  if (was !== on) {
    setWas(on);
    if (pop && on) {
      scale.setValue(0.6);
      Animated.spring(scale, { toValue: 1, stiffness: 600, damping: 9, mass: 1, useNativeDriver: true }).start();
    }
  }
  const color = disabled ? alpha(c.onSurfaceVariant, 0.38) : on && onColor ? onColor : c.onSurfaceVariant;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count}` : label}
      accessibilityState={{ selected: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={styles.action}>
      <View style={styles.actionIcon}>
        <Animated.View style={{ transform: [{ scale }] }}>
          <Glyph name={icon} size={18} color={color} filled={on} />
        </Animated.View>
      </View>
      {count ? <Text style={[type.bodySmall, { color }]}>{count.toLocaleString()}</Text> : null}
    </Pressable>
  );
}

function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A video in the timeline: plays muted and on a loop while it's the one on screen; tap for the full-screen player. */
function InlineVideo({ post, video, playing }: { post: Post; video: MediaAttachment; playing: boolean }) {
  const player = useVideoPlayer(video.url, (p) => {
    p.loop = true;
    p.muted = true;
    p.timeUpdateEventInterval = 1;
  });
  const { currentTime } = useEvent(player, 'timeUpdate', { currentTime: 0, currentLiveTimestamp: null, currentOffsetFromLive: null, bufferedPosition: 0 });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  useEffect(() => {
    if (playing) player.play();
    else player.pause();
  }, [playing, player]);
  // Tall videos are shown tall, but not taller than a phone screen's worth of timeline.
  const ratio = video.width && video.height ? Math.min(Math.max(video.width / video.height, 0.75), 1.78) : 0.75;
  const left = video.duration ? video.duration - currentTime : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Watch video${video.description ? `: ${video.description}` : ''}`}
      onPress={() => router.push({ pathname: '/watch/[id]', params: { id: post.id } })}
      style={[styles.media, { aspectRatio: ratio }]}>
      {video.previewUrl && (!isPlaying || currentTime === 0) ? (
        <Image
          source={{ uri: video.previewUrl }}
          placeholder={video.blurhash ? { blurhash: video.blurhash } : undefined}
          contentFit="cover"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} pointerEvents="none" />
      <View style={styles.videoBadges} pointerEvents="none">
        {left !== null ? (
          <View style={styles.videoChip}>
            <Text style={[type.labelSmall, styles.videoChipText]}>{clock(left)}</Text>
          </View>
        ) : null}
        <View style={styles.videoChip}>
          <Glyph name="volume_off" size={14} color="#ffffff" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, borderBottomWidth: StyleSheet.hairlineWidth },
  context: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 30, marginBottom: 4 },
  body: { flexDirection: 'row', gap: 12 },
  main: { flex: 1, minWidth: 0 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // The name stays whole where it can; the handle gives way first.
  name: { flexShrink: 0, maxWidth: '65%', fontWeight: '700' },
  handle: { flexShrink: 1 },
  more: { marginLeft: 'auto', paddingLeft: 8 },
  text: { marginTop: 2 },
  focusedText: { fontSize: 20, lineHeight: 28 },
  spoiler: { marginTop: 6, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  media: { width: '100%', marginTop: 10, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  videoBadges: { position: 'absolute', left: 8, bottom: 8, flexDirection: 'row', gap: 6 },
  videoChip: { height: 22, minWidth: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  videoChipText: { color: '#ffffff' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', maxWidth: 360, marginTop: 4, marginLeft: -10 },
  action: { flexDirection: 'row', alignItems: 'center', minHeight: 40, minWidth: 56, gap: 2 },
  actionIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
});
