import { POST_MAX_LENGTH, type Visibility } from '@pinstripe/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type MastodonMedia, toMastodonVisibility, toPost } from '@/api/mastodon';
import { type Picked, uploadMedia, waitForMedia } from '@/api/upload';
import { useAuth, useSource } from '@/auth/session';
import { aquaText, Card, GelButton } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { BarButton, TableBackground, TableRow } from '@/components/ios6';
import { glassInput } from '@/components/liquid-controls';
import { PickerSheet } from '@/components/picker';
import { ProgressBar } from '@/components/progress-bar';
import { ScreenHeader } from '@/components/screen-header';
import { publishPostEvent } from '@/hooks/use-post-list';
import { play } from '@/sound/sounds';
import { colors, fontFamily } from '@/theme/aqua';
import { useGlass } from '@/theme/theme';

const VISIBILITIES = [
  { value: 'public', label: 'Public' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'followers', label: 'Followers' },
] as const;

type Stage = { kind: 'uploading'; progress: number } | { kind: 'processing' } | { kind: 'ready'; media: MastodonMedia } | { kind: 'failed'; message: string };

/**
 * Posting a video picked or recorded on the Videos tab. The upload starts
 * straight away, so it runs while the caption is written; Post is enabled
 * once the server has finished processing.
 */
export default function NewVideoScreen() {
  const glass = useGlass();
  const insets = useSafeAreaInsets();
  const { state, refreshAccount } = useAuth();
  const source = useSource();
  const params = useLocalSearchParams<{ asset?: string }>();
  const asset = useMemo<Picked | null>(() => {
    try {
      return params.asset ? (JSON.parse(params.asset) as Picked) : null;
    } catch {
      return null;
    }
  }, [params.asset]);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(source.defaultVisibility === 'direct' ? 'followers' : source.defaultVisibility);
  const [stage, setStage] = useState<Stage>({ kind: 'uploading', progress: 0 });
  const [attempt, setAttempt] = useState(0);
  const [posting, setPosting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const player = useVideoPlayer(asset?.uri ?? null, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  const remaining = POST_MAX_LENGTH - [...caption].length;

  useEffect(() => {
    if (!asset || state.status !== 'signedIn') return;
    let cancelled = false;
    (async () => {
      try {
        const uploaded = await uploadMedia(state.client, state.token, asset, {
          onProgress: (progress) => !cancelled && setStage({ kind: 'uploading', progress }),
        });
        if (cancelled) return;
        setStage({ kind: 'processing' });
        const media = uploaded.url ? uploaded : await waitForMedia(state.client, uploaded.id);
        if (!cancelled) setStage({ kind: 'ready', media });
      } catch (e) {
        if (!cancelled) setStage({ kind: 'failed', message: e instanceof Error ? e.message : 'Couldn’t upload that video.' });
      }
    })();
    return () => {
      cancelled = true;
    };
    // The client only changes when the token does; restarting then is right.
  }, [asset, state, attempt]);

  const post = async () => {
    if (state.status !== 'signedIn' || stage.kind !== 'ready') return;
    setPosting(true);
    setError(null);
    try {
      const status = await state.client.postStatus({
        status: caption.trim(),
        visibility: toMastodonVisibility(visibility),
        media_ids: [stage.media.id],
      });
      publishPostEvent({ type: 'created', post: toPost(status, state.server) });
      play('sent');
      refreshAccount();
      // Opened directly (a link, a reload) there's nothing to go back to.
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t post. Please try again.');
      setPosting(false);
    }
  };

  if (!asset) {
    return (
      <TableBackground>
        <ScreenHeader title="New Video" back="Cancel" />
        <View style={styles.body}>
          <FormError message="That video couldn’t be opened. Please choose it again." />
        </View>
      </TableBackground>
    );
  }

  return (
    <TableBackground>
      <ScreenHeader
        title="New Video"
        back="Cancel"
        right={<BarButton done title={posting ? 'Posting…' : 'Post'} disabled={stage.kind !== 'ready' || posting || remaining < 0} onPress={post} />}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
          <FormError message={error} />
          <View style={styles.previewRow}>
            <View style={styles.preview}>
              <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} accessibilityLabel="Video preview" />
            </View>
            <View style={styles.status}>
              {stage.kind === 'uploading' ? (
                <>
                  <Text style={[aquaText.body, styles.strong]}>Uploading… {Math.round(stage.progress * 100)}%</Text>
                  <ProgressBar progress={stage.progress} label="Uploading video" />
                </>
              ) : stage.kind === 'processing' ? (
                <>
                  <Text style={[aquaText.body, styles.strong]}>Processing…</Text>
                  <ProgressBar progress={null} label="Processing video" />
                  <Text style={aquaText.handle}>Usually under a minute. You can keep writing.</Text>
                </>
              ) : stage.kind === 'ready' ? (
                <Text style={[aquaText.body, styles.strong]}>Ready to post.</Text>
              ) : (
                <>
                  <FormError message={stage.message} />
                  <GelButton tone="gray" small title="Try Again" onPress={() => {
                      setStage({ kind: 'uploading', progress: 0 });
                      setAttempt((n) => n + 1);
                    }}
                  />
                </>
              )}
            </View>
          </View>
          <Card style={styles.card}>
            <TextInput
              accessibilityLabel="Caption"
              placeholder="Add a caption, #hashtags or @mentions…"
              placeholderTextColor="#767676"
              multiline
              value={caption}
              onChangeText={setCaption}
              style={[styles.input, glass && glassInput]}
            />
            <Text style={[aquaText.handle, styles.count, remaining < 0 && styles.over]}>{remaining}</Text>
          </Card>
          <View style={styles.group}>
            <TableRow
              title="Who Can See It"
              detail={VISIBILITIES.find((v) => v.value === visibility)?.label ?? 'Public'}
              accessory="chevron"
              onPress={() => setChoosing(true)}
            />
          </View>
          <PickerSheet
            visible={choosing}
            title="Who Can See It"
            options={VISIBILITIES}
            value={visibility as (typeof VISIBILITIES)[number]['value']}
            onChange={setVisibility}
            onClose={() => setChoosing(false)}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </TableBackground>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#aaaeb3',
    overflow: 'hidden',
    boxShadow: '0 1px 0 rgba(255,255,255,0.7)',
  },
  flex: { flex: 1 },
  body: { padding: 16, gap: 12 },
  previewRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  preview: { width: 120, aspectRatio: 9 / 16, borderRadius: 8, overflow: 'hidden', backgroundColor: '#000', borderWidth: 1, borderColor: '#8f8f8f' },
  status: { flex: 1, gap: 8 },
  card: { gap: 6 },
  input: {
    minHeight: 96,
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
  strong: { fontWeight: '700' },
  count: { alignSelf: 'flex-end' },
  over: { color: colors.danger, fontWeight: '700' },
});
