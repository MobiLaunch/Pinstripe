import { formatHandle, type Timeline } from '@pinstripe/core';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Orb, Segmented } from '@/components/aqua';
import { Icon } from '@/components/icon';
import { initials } from '@/components/initials';
import { videos } from '@/data/fixtures';
import { colors, fontFamily, gradients } from '@/theme/aqua';

const TIMELINES = [
  { value: 'home', label: 'Following' },
  { value: 'local', label: 'Local' },
  { value: 'federated', label: 'Federated' },
] as const;

/** Home: full-bleed short video with the action rail. Player comes next. */
export default function VideosScreen() {
  const insets = useSafeAreaInsets();
  const [timeline, setTimeline] = useState<Timeline>('home');
  const [liked, setLiked] = useState(false);
  const video = videos[0]!;
  const likes = video.counts.favourites + (liked ? 1 : 0);

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#3a7cc2', '#123658', '#050d18']} style={styles.stage}>
        <Text style={styles.placeholder}>VIDEO PLAYS HERE</Text>
      </LinearGradient>
      <LinearGradient colors={gradients.videoScrim.colors} style={styles.scrim} pointerEvents="none" />

      <View style={[styles.header, { top: insets.top + 12 }]}>
        <Segmented options={TIMELINES} value={timeline} onChange={setTimeline} style={styles.flex} />
        <Orb active size={46} accessibilityLabel="Record a video">
          <Icon name="camera" size={24} color="#fff" />
        </Orb>
      </View>

      <View style={styles.rail}>
        <Avatar initials={initials(video.account.displayName)} size={52} />
        <RailAction label={likes.toLocaleString()}>
          <Orb active={liked} accessibilityLabel="Like" accessibilityState={{ selected: liked }} onPress={() => setLiked(!liked)}>
            <Icon name="heart" size={24} color="#fff" filled={liked} />
          </Orb>
        </RailAction>
        <RailAction label={String(video.counts.replies)}>
          <Orb accessibilityLabel="Comments"><Icon name="comment" size={24} color="#fff" /></Orb>
        </RailAction>
        <RailAction label={String(video.counts.boosts)}>
          <Orb accessibilityLabel="Boost"><Icon name="boost" size={24} color="#fff" /></Orb>
        </RailAction>
        <RailAction label="Share">
          <Orb accessibilityLabel="Share"><Icon name="share" size={24} color="#fff" /></Orb>
        </RailAction>
      </View>

      <View style={styles.caption}>
        <Text style={styles.name}>
          {video.account.displayName}  <Text style={styles.handle}>{formatHandle(video.account)}</Text>
        </Text>
        <Text style={styles.body}>
          {video.content} <Text style={styles.tags}>{video.tags.map((t) => `#${t}`).join(' ')}</Text>
        </Text>
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
  placeholder: { fontFamily, fontSize: 12, letterSpacing: 3, color: '#a9c4e4' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 340 },
  header: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rail: { position: 'absolute', right: 12, bottom: 48, alignItems: 'center', gap: 14 },
  action: { alignItems: 'center' },
  count: { fontFamily, fontSize: 12, fontWeight: '700', color: colors.onVideo, marginTop: 4, ...shadow },
  caption: { position: 'absolute', left: 16, right: 84, bottom: 34, gap: 6 },
  name: { fontFamily, fontSize: 16, fontWeight: '700', color: colors.onVideo, ...shadow },
  handle: { fontSize: 12, fontWeight: '400', color: colors.onVideoMuted },
  body: { fontFamily, fontSize: 14, lineHeight: 20, color: colors.onVideo, ...shadow },
  tags: { color: '#a8d4ff', fontWeight: '700' },
});
