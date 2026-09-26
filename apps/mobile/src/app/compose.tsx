/**
 * Writing a post in the Android look, full screen as Twitter for Android
 * had it: close and Post up top, your avatar beside "What's happening?",
 * who can see it as a chip, and along the bottom photos, video and the
 * ring that fills as you near the limit.
 */
import { POST_MAX_LENGTH } from '@pinstripe/core';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { useAccount } from '@/auth/session';
import { FormError } from '@/components/form-error';
import { initials } from '@/components/initials';
import { M3Avatar, M3Button } from '@/components/m3/kit';
import { WavyProgress } from '@/components/m3/loaders';
import { M3Pressable } from '@/components/m3/pressable';
import { Glyph, type SymbolName } from '@/components/m3/symbol';
import { PickerSheet } from '@/components/picker';
import { useComposer, VISIBILITIES } from '@/hooks/use-composer';
import { alpha, type, useM3 } from '@/theme/m3';

const VISIBILITY_ICON: Record<string, SymbolName> = { public: 'public', unlisted: 'lock', followers: 'group', direct: 'alternate_email' };

const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

export default function ComposeScreen() {
  const { c } = useM3();
  const me = useAccount();
  const insets = useSafeAreaInsets();
  const composer = useComposer();
  const [choosing, setChoosing] = useState(false);
  const current = VISIBILITIES.find((v) => v.value === composer.visibility)!;

  const post = async () => {
    if (await composer.submit()) close();
  };

  return (
    <KeyboardAvoidingView style={[styles.root, { backgroundColor: c.surface, paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.top}>
        <M3Pressable accessibilityRole="button" accessibilityLabel="Discard" content={c.onSurface} borderless onPress={close} style={styles.iconButton}>
          <Glyph name="close" color={c.onSurface} />
        </M3Pressable>
        <M3Button small title={composer.posting ? 'Posting…' : 'Post'} disabled={!composer.canPost} onPress={post} />
      </View>
      <ScrollView style={styles.flex} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <FormError message={composer.error} />
        <View style={styles.row}>
          <M3Avatar initials={initials(me.displayName)} uri={me.avatarUrl} size={40} />
          <View style={styles.flex}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Who can see it: ${current.label}. Tap to change.`}
              onPress={() => setChoosing(true)}
              style={[styles.chip, { borderColor: c.outline }]}>
              <Glyph name={VISIBILITY_ICON[composer.visibility] ?? 'public'} size={16} color={c.primary} />
              <Text style={[type.labelLarge, { color: c.primary }]}>{current.label}</Text>
            </Pressable>
            <TextInput
              accessibilityLabel="New post"
              placeholder="What’s happening?"
              placeholderTextColor={c.onSurfaceVariant}
              cursorColor={c.primary}
              selectionColor={alpha(c.primary, 0.4)}
              multiline
              autoFocus
              value={composer.draft}
              onChangeText={composer.setDraft}
              style={[type.bodyLarge, styles.input, { color: c.onSurface }]}
            />
          </View>
        </View>
        {composer.attachments.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachments}>
            {composer.attachments.map((a) => (
              <View key={a.key} style={[styles.thumb, { backgroundColor: c.surfaceContainerHigh }]}>
                <Image source={{ uri: a.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessibilityLabel="Attached photo" />
                {a.media ? null : (
                  <View style={styles.thumbProgress}>
                    <WavyProgress progress={a.progress} label="Uploading photo" />
                  </View>
                )}
                <Pressable accessibilityRole="button" accessibilityLabel="Remove photo" hitSlop={8} onPress={() => composer.removeAttachment(a.key)} style={styles.remove}>
                  <Glyph name="close" size={18} color="#ffffff" />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </ScrollView>
      <View style={[styles.toolbar, { borderTopColor: c.outlineVariant, paddingBottom: 8 + insets.bottom }]}>
        <M3Pressable
          accessibilityRole="button"
          accessibilityLabel="Add photos"
          content={c.primary}
          borderless
          disabled={composer.attachments.length >= 4}
          onPress={composer.pickPhotos}
          style={[styles.iconButton, composer.attachments.length >= 4 && styles.disabled]}>
          <Glyph name="image" color={c.primary} />
        </M3Pressable>
        <M3Pressable
          accessibilityRole="button"
          accessibilityLabel="Record a video"
          content={c.primary}
          borderless
          onPress={() => {
            close();
            router.push('/camera');
          }}
          style={styles.iconButton}>
          <Glyph name="videocam" color={c.primary} />
        </M3Pressable>
        <View style={styles.flex} />
        <CounterRing remaining={composer.remaining} />
      </View>
      <PickerSheet
        visible={choosing}
        title="Who can see it"
        options={VISIBILITIES}
        value={composer.visibility}
        onChange={composer.setVisibility}
        onClose={() => setChoosing(false)}
      />
    </KeyboardAvoidingView>
  );
}

/** Twitter's ring: fills as you write, turns amber near the end and red past it, with the count once it's close. */
function CounterRing({ remaining }: { remaining: number }) {
  const { c } = useM3();
  const used = POST_MAX_LENGTH - remaining;
  const size = remaining <= 20 ? 30 : 22;
  const r = size / 2 - 2;
  const circumference = 2 * Math.PI * r;
  const color = remaining < 0 ? c.error : remaining <= 20 ? '#f4b400' : c.primary;
  return (
    <View style={styles.counter} accessibilityLabel={`${remaining} characters left`} accessible>
      {remaining <= 20 ? <Text style={[type.labelMedium, { color: remaining < 0 ? c.error : c.onSurfaceVariant }]}>{remaining}</Text> : null}
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.surfaceContainerHighest} strokeWidth={3} fill="none" />
        {used > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circumference * Math.min(1, used / POST_MAX_LENGTH)} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  top: { height: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingRight: 16 },
  iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.38 },
  body: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  row: { flexDirection: 'row', gap: 12 },
  chip: { alignSelf: 'flex-start', height: 32, borderRadius: 8, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, marginBottom: 8 },
  input: { fontSize: 20, lineHeight: 28, minHeight: 120, textAlignVertical: 'top', paddingVertical: 4, outlineWidth: 0 },
  attachments: { gap: 8, paddingLeft: 52 },
  thumb: { width: 120, height: 150, borderRadius: 16, overflow: 'hidden' },
  thumbProgress: { position: 'absolute', left: 8, right: 8, bottom: 8 },
  remove: { position: 'absolute', top: 6, right: 6, width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingTop: 4, paddingRight: 16, borderTopWidth: StyleSheet.hairlineWidth },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
