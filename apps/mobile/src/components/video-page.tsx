import { formatHandle, type Post } from '@pinstripe/core';
import { useEvent } from 'expo';
import { Image } from 'expo-image';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { NetworkStateType, useNetworkState } from 'expo-network';
import { router } from 'expo-router';
import { useVideoPlayer, type VideoPlayer, VideoView } from 'expo-video';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MastodonRelationship } from '@/api/mastodon';
import { saveVideo } from '@/api/save-video';
import { useAuth } from '@/auth/session';
import { Avatar, Orb } from '@/components/aqua';
import { Icon } from '@/components/icon';
import { initials } from '@/components/initials';
import { GlassSurface } from '@/components/liquid';
import { ShareSheet } from '@/components/share-sheet';
import { target } from '@/hooks/use-post-list';
import { colors, fontFamily, gradients } from '@/theme/aqua';
import { useM3 } from '@/theme/m3';
import { material } from '@/theme/startup';
import { useAccent, useGlass } from '@/theme/theme';
import { RichText } from '@/components/rich-text';

/** A video counts as viewed after this much playback. */
const VIEW_AFTER_MS = 2000;

/**
 * Playback settings from Settings (Pinstripe servers; defaults elsewhere).
 * "Save data on cellular" turns autoplay off while on mobile data.
 */
export function usePlaybackPreferences() {
  const { state } = useAuth();
  const network = useNetworkState();
  const [prefs, setPrefs] = useState({ autoplay: true, muted: false, saveData: true });
  useEffect(() => {
    if (state.status !== 'signedIn') return;
    state.client
      .preferences()
      .then((p) => setPrefs({ autoplay: p.autoplay_videos, muted: p.start_muted, saveData: p.save_data_on_cellular }))
      .catch(() => {});
  }, [state]);
  const cellular = network.type === NetworkStateType.CELLULAR;
  return { autoplay: prefs.autoplay && !(prefs.saveData && cellular), muted: prefs.muted };
}

/** One full-screen video with its action rail, caption and progress. Plays while `active`. */
export function VideoPage({
  post,
  height,
  active,
  autoplay,
  startMuted,
  onFavourite,
  onBoost,
  bottomInset = 0,
}: {
  post: Post;
  height: number;
  active: boolean;
  autoplay: boolean;
  startMuted: boolean;
  onFavourite: () => void;
  onBoost: () => void;
  /** Room kept clear at the bottom (the floating Glass tab bar). */
  bottomInset?: number;
}) {
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const viewerId = state.status === 'signedIn' ? state.account.id : null;
  const accent = useAccent();
  const glass = useGlass();
  const { c } = useM3();
  const shown = target(post);
  const video = shown.media[0]!;
  const [started, setStarted] = useState(false);
  const [saving, setSaving] = useState(false);
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

  // A view counts once, after a couple of seconds of watching.
  const counted = useRef(false);
  useEffect(() => {
    if (!active || !isPlaying || counted.current || !client) return;
    const timer = setTimeout(() => {
      counted.current = true;
      client.view(shown.id).catch(() => {});
    }, VIEW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [active, isPlaying, client, shown.id]);

  // Whether to offer Follow on the avatar: asked once the video is on screen.
  const [relationship, setRelationship] = useState<MastodonRelationship | null>(null);
  useEffect(() => {
    if (!active || !client || relationship || shown.account.id === viewerId) return;
    client.relationship(shown.account.id).then(setRelationship).catch(() => {});
  }, [active, client, relationship, shown.account.id, viewerId]);
  const canFollow = !!relationship && !relationship.following && !relationship.requested && !relationship.blocking && !relationship.blocked_by;

  const follow = async () => {
    if (!client) return;
    setRelationship((r) => (r ? { ...r, requested: true } : r));
    try {
      setRelationship(await client.follow(shown.account.id, 'follow'));
    } catch {
      setRelationship(null);
    }
  };

  const togglePlay = () => {
    if (isPlaying) player.pause();
    else {
      setStarted(true);
      player.play();
    }
  };

  const [sharing, setSharing] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await saveVideo(video.url);
    } catch {
      // The share sheet was dismissed or the download failed; nothing to do.
    } finally {
      setSaving(false);
    }
  };

  const favourited = !!shown.viewer?.favourited;
  const boosted = !!shown.viewer?.boosted;
  const boostable = shown.visibility === 'public' || shown.visibility === 'unlisted';
  const canSave = shown.account.allowsVideoDownloads || shown.account.id === viewerId;
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

      <View style={[styles.rail, { bottom: 48 + bottomInset }]}>
        <View style={styles.author}>
          <Pressable accessibilityRole="link" accessibilityLabel={`${shown.account.displayName}'s profile`} onPress={() => router.push(`/profile/${shown.account.id}`)}>
            <Avatar initials={initials(shown.account.displayName)} size={52} uri={shown.account.avatarUrl} />
          </Pressable>
          {canFollow ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Follow ${shown.account.displayName}`} onPress={follow} hitSlop={8} style={[styles.follow, { backgroundColor: accent.color }]}>
              <Icon name="plus" size={14} color="#fff" strokeWidth={3} />
            </Pressable>
          ) : null}
        </View>
        <RailAction label={shown.counts.favourites.toLocaleString()}>
          <Orb active={favourited && !material} style={railOrb} accessibilityLabel={favourited ? 'Unlike' : 'Like'} accessibilityState={{ selected: favourited }} onPress={onFavourite}>
            <Icon name="heart" size={material ? 30 : 24} color={material && favourited ? c.like : '#fff'} filled={favourited} />
          </Orb>
        </RailAction>
        <RailAction label={shown.counts.replies.toLocaleString()}>
          <Orb style={railOrb} accessibilityLabel="Comments" onPress={() => router.push(`/status/${shown.id}`)}>
            <Icon name="comment" size={material ? 28 : 24} color="#fff" filled={material} />
          </Orb>
        </RailAction>
        <RailAction label={shown.counts.boosts.toLocaleString()}>
          <Orb active={boosted && !material} style={railOrb} accessibilityLabel={boosted ? 'Undo boost' : 'Boost'} accessibilityState={{ selected: boosted, disabled: !boostable }} disabled={!boostable} onPress={onBoost}>
            <Icon name="boost" size={material ? 30 : 24} color={material && boosted ? c.boost : '#fff'} />
          </Orb>
        </RailAction>
        <RailAction label={muted ? 'Muted' : 'Sound'}>
          <Orb style={railOrb} accessibilityLabel={muted ? 'Unmute' : 'Mute'} onPress={() => toggleMuted(player)}>
            <Icon name={muted ? 'soundOff' : 'sound'} size={24} color="#fff" />
          </Orb>
        </RailAction>
        {canSave ? (
          <RailAction label={saving ? 'Saving…' : 'Save'}>
            <Orb style={railOrb} accessibilityLabel="Save video" disabled={saving} onPress={save}>
              <Icon name="download" size={24} color="#fff" />
            </Orb>
          </RailAction>
        ) : null}
        <RailAction label="Share">
          <Orb style={railOrb} accessibilityLabel="Share" onPress={() => setSharing(true)}>
            <Icon name="share" size={24} color="#fff" />
          </Orb>
        </RailAction>
      </View>

      <ShareSheet
        visible={sharing}
        url={shown.uri}
        text={`${shown.account.displayName} on Pinstripe`}
        onSaveVideo={canSave ? save : undefined}
        onClose={() => setSharing(false)}
      />
      {/* Frosted glass behind the caption: the video blurs and darkens through it. */}
      <View style={[styles.caption, glass && styles.captionGlass, material && styles.captionM3, { bottom: 30 + bottomInset }]}>
        {material ? null : glass ? (
          <GlassSurface radius={24} dark style={StyleSheet.absoluteFill} />
        ) : (
          <>
            <BlurView intensity={28} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.captionTint} pointerEvents="none" />
            <LinearGradient colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']} style={styles.captionSheen} pointerEvents="none" />
          </>
        )}
        {post.reblog ? <Text style={styles.boosted}>Boosted by {post.account.displayName}</Text> : null}
        <Text style={styles.name} onPress={() => router.push(`/profile/${shown.account.id}`)}>
          {shown.account.displayName} <Text style={styles.handle}>{formatHandle(shown.account)}</Text>
        </Text>
        {shown.content ? <RichText post={shown} style={styles.body} linkStyle={styles.captionLink} numberOfLines={4} /> : null}
      </View>
      <View style={[styles.progress, glass && styles.progressGlass, material && styles.progressM3, { bottom: (material ? 0 : 12) + bottomInset }]} accessibilityRole="progressbar" accessibilityLabel="Playback" accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]}>
          {glass || material ? (
            <View style={[StyleSheet.absoluteFill, glass ? styles.progressFillGlass : { backgroundColor: c.primary }]} />
          ) : (
            <LinearGradient colors={['#bfe0ff', '#5aa3f2', '#1f6fd4', '#3b8cea']} locations={[0, 0.5, 0.5, 1]} style={StyleSheet.absoluteFill} />
          )}
        </View>
      </View>
    </View>
  );
}

/** expo-video players are changed by setting properties. */
function toggleMuted(player: VideoPlayer) {
  player.muted = !player.muted;
}

function RailAction({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.action}>
      {children}
      <Text style={styles.count}>{label}</Text>
    </View>
  );
}

/** Android: TikTok's bare icons on the video, no discs. */
const railOrb = material ? ({ backgroundColor: 'transparent' } as const) : undefined;

const shadow = { textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 };

const styles = StyleSheet.create({
  page: { width: '100%', backgroundColor: '#000' },
  paused: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 340 },
  rail: { position: 'absolute', right: 12, bottom: 48, alignItems: 'center', gap: 12 },
  follow: {
    position: 'absolute',
    bottom: -8,
    alignSelf: 'center',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  author: { marginBottom: 6 },
  action: { alignItems: 'center' },
  count: { fontFamily, fontSize: 12, fontWeight: '700', color: colors.onVideo, marginTop: 4, ...shadow },
  caption: {
    position: 'absolute',
    left: 10,
    right: 80,
    bottom: 30,
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.45)',
  },
  captionGlass: { borderWidth: 0, borderRadius: 24, boxShadow: 'none' },
  progressGlass: { height: 4, borderRadius: 2, borderWidth: 0, backgroundColor: 'rgba(255,255,255,0.3)', boxShadow: 'none' },
  progressFillGlass: { backgroundColor: '#ffffff' },
  captionM3: { borderWidth: 0, boxShadow: 'none', paddingHorizontal: 6, left: 8 },
  progressM3: { left: 0, right: 0, height: 3, borderRadius: 0, borderWidth: 0, backgroundColor: 'rgba(255,255,255,0.25)', boxShadow: 'none' },
  captionTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10,14,22,0.35)' },
  captionSheen: { position: 'absolute', top: 0, left: 0, right: 0, height: 18 },
  boosted: { fontFamily, fontSize: 12, color: colors.onVideoMuted, ...shadow },
  name: { fontFamily, fontSize: 16, fontWeight: '700', color: colors.onVideo, ...shadow },
  handle: { fontSize: 12, fontWeight: '400', color: colors.onVideoMuted },
  body: { fontFamily, fontSize: 14, lineHeight: 20, color: colors.onVideo, ...shadow },
  captionLink: { color: '#ffffff' },
  progress: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.6)',
    overflow: 'hidden',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.15)',
  },
  progressFill: { height: '100%', borderRadius: 3, overflow: 'hidden' },
});
