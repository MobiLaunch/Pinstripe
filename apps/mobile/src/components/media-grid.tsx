import type { MediaAttachment } from '@pinstripe/core';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Orb } from '@/components/aqua';
import { Icon } from '@/components/icon';

/** Photos in a grid (1–4), or a single video that plays when tapped. */
export function MediaGrid({ media }: { media: MediaAttachment[] }) {
  if (!media.length) return null;
  const first = media[0]!;
  if (first.kind === 'video') return <InlineVideo video={first} />;

  const photos = media.filter((m) => m.kind === 'image').slice(0, 4);
  if (photos.length === 1) {
    const ratio = first.width && first.height ? Math.min(Math.max(first.width / first.height, 0.6), 1.9) : 4 / 3;
    return <Photo media={first} style={[styles.single, { aspectRatio: ratio }]} />;
  }
  return (
    <View style={[styles.grid, photos.length > 2 ? styles.tall : styles.short]}>
      {photos.map((m, i) => (
        <Photo
          key={m.id}
          media={m}
          // Three photos: the first takes the whole left column.
          style={[styles.cell, photos.length === 3 && i === 0 ? styles.fullHeight : photos.length > 2 ? styles.halfHeight : styles.fullHeight]}
        />
      ))}
    </View>
  );
}

function Photo({ media, style }: { media: MediaAttachment; style: object }) {
  return (
    <Image
      source={{ uri: media.previewUrl ?? media.url }}
      placeholder={media.blurhash ? { blurhash: media.blurhash } : undefined}
      contentFit="cover"
      transition={150}
      style={[styles.photo, style]}
      accessibilityLabel={media.description || 'Photo'}
      accessible
    />
  );
}

function InlineVideo({ video }: { video: MediaAttachment }) {
  const [playing, setPlaying] = useState(false);
  const ratio = video.width && video.height ? Math.min(Math.max(video.width / video.height, 0.56), 1.78) : 16 / 9;
  return (
    <View style={[styles.single, styles.video, { aspectRatio: ratio }]}>
      {playing ? (
        <Player url={video.url} />
      ) : (
        <Pressable accessibilityRole="button" accessibilityLabel={`Play video${video.description ? `: ${video.description}` : ''}`} onPress={() => setPlaying(true)} style={StyleSheet.absoluteFill}>
          <Image
            source={video.previewUrl ? { uri: video.previewUrl } : undefined}
            placeholder={video.blurhash ? { blurhash: video.blurhash } : undefined}
            contentFit="cover"
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.playOverlay} pointerEvents="none">
            <Orb active size={56} accessibilityElementsHidden>
              <Icon name="play" size={26} color="#fff" filled />
            </Orb>
          </View>
        </Pressable>
      )}
    </View>
  );
}

function Player({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = true;
    p.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls />;
}

const styles = StyleSheet.create({
  single: { width: '100%', marginTop: 10, borderRadius: 7, overflow: 'hidden', borderWidth: 1, borderColor: '#8f8f8f', backgroundColor: '#dfe8f2' },
  video: { backgroundColor: '#000' },
  grid: { marginTop: 10, flexDirection: 'column', flexWrap: 'wrap', gap: 3, borderRadius: 7, overflow: 'hidden' },
  short: { height: 170 },
  tall: { height: 240 },
  cell: { width: '49.5%' },
  fullHeight: { height: '100%' },
  halfHeight: { height: '49.4%' },
  photo: { backgroundColor: '#dfe8f2' },
  playOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
