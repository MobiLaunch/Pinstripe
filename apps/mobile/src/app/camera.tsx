/**
 * Recording, in the iOS 6 camera: the iris swirls open on the viewfinder,
 * a black glass flash and flip button sit on top, and the brushed-metal
 * toolbar at the bottom holds Cancel, the silver record button and the
 * library. The timer counts up while recording; stopping closes the iris
 * and goes on to posting.
 */
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { openNewVideo, pickVideoFromLibrary } from '@/api/pick-video';
import { checkPicked, type Picked } from '@/api/upload';
import { GelButton } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { Iris } from '@/components/iris';
import { play } from '@/sound/sounds';
import { fontFamily } from '@/theme/aqua';

const MAX_SECONDS = 60;

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const [cameraPermission, requestCamera] = useCameraPermissions();
  const [micPermission, requestMic] = useMicrophonePermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [torch, setTorch] = useState(false);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [irisOpen, setIrisOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorded = useRef<Picked | null>(null);
  const started = useRef(0);

  const allowed = !!cameraPermission?.granted && !!micPermission?.granted;

  useEffect(() => {
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) requestCamera();
  }, [cameraPermission, requestCamera]);
  useEffect(() => {
    if (micPermission && !micPermission.granted && micPermission.canAskAgain) requestMic();
  }, [micPermission, requestMic]);

  // The iris opens once there's a picture to show.
  const onReady = () => {
    setReady(true);
    if (!irisOpen && !recorded.current) {
      play('shutter');
      setIrisOpen(true);
    }
  };

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 250);
    return () => clearInterval(id);
  }, [recording]);

  const start = async () => {
    if (!camera.current || recording) return;
    setError(null);
    setSeconds(0);
    started.current = Date.now();
    setRecording(true);
    play('recordStart');
    try {
      const result = await camera.current.recordAsync({ maxDuration: MAX_SECONDS });
      const duration = Date.now() - started.current;
      if (!result?.uri) throw new Error('Nothing was recorded.');
      const asset: Picked = {
        uri: result.uri,
        type: 'video',
        mimeType: Platform.OS === 'ios' ? 'video/quicktime' : 'video/mp4',
        fileSize: new File(result.uri).size,
        width: 0,
        height: 0,
        duration: Math.min(duration, MAX_SECONDS * 1000),
        fileName: Platform.OS === 'ios' ? 'recording.mov' : 'recording.mp4',
      };
      const problem = checkPicked(asset);
      if (problem) throw new Error(problem);
      recorded.current = asset;
      play('recordStop');
      play('shutter');
      setIrisOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t record the video.');
    } finally {
      setRecording(false);
    }
  };

  const stop = () => camera.current?.stopRecording();

  const library = async () => {
    const problem = await pickVideoFromLibrary(true);
    if (problem) setError(problem);
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  if (cameraPermission && micPermission && !allowed) {
    const canAsk = cameraPermission.canAskAgain && micPermission.canAskAgain;
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Icon name="camera" size={48} color="#8d9096" />
        <Text style={styles.askTitle}>Pinstripe Would Like to Use the Camera and Microphone</Text>
        <Text style={styles.askText}>
          {canAsk ? 'To record videos, allow both.' : 'Turn them on for Pinstripe in Settings › Privacy, then come back.'}
        </Text>
        {canAsk ? (
          <GelButton
            rect
            title="Allow"
            onPress={() => {
              requestCamera();
              requestMic();
            }}
          />
        ) : null}
        <GelButton rect tone="gray" title="Cancel" onPress={close} />
      </View>
    );
  }

  const time = `00:${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <View style={styles.root}>
      <View style={styles.finder}>
        {allowed ? (
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            mode="video"
            facing={facing}
            enableTorch={torch}
            videoQuality="1080p"
            onCameraReady={onReady}
            onMountError={(e) => setError(e.message)}
          />
        ) : null}
        <Iris
          open={irisOpen}
          onSettled={() => {
            if (!irisOpen && recorded.current) openNewVideo(recorded.current, true);
          }}
        />
        <View style={[styles.top, { top: insets.top + 10 }]}>
          {facing === 'back' ? (
            <GlassPill
              accessibilityLabel={torch ? 'Light on' : 'Light off'}
              accessibilityState={{ checked: torch }}
              onPress={() => setTorch((t) => !t)}>
              <Icon name="flash" size={16} color={torch ? '#ffd426' : '#ffffff'} filled={torch} strokeWidth={1.8} />
              <Text style={styles.pillText}>{torch ? 'On' : 'Off'}</Text>
            </GlassPill>
          ) : (
            <View />
          )}
          {recording ? (
            <View style={styles.timer} accessibilityLiveRegion="polite" accessibilityLabel={`Recording, ${seconds} seconds`}>
              <Blink />
              <Text style={styles.timerText}>{time}</Text>
            </View>
          ) : null}
          <GlassPill accessibilityLabel="Switch camera" disabled={recording} onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}>
            <Icon name="flip" size={22} color="#ffffff" strokeWidth={1.8} />
          </GlassPill>
        </View>
        {error ? (
          <View style={[styles.error, { top: insets.top + 60 }]}>
            <FormError message={error} />
          </View>
        ) : null}
      </View>

      {/* The brushed-metal toolbar. */}
      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 12 }]}>
        <LinearGradient colors={['#6d7075', '#45484d', '#2d2f33', '#232528']} locations={[0, 0.08, 0.6, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.toolbarShine} />
        <View style={styles.side}>
          <DarkButton title="Cancel" disabled={recording} onPress={close} />
        </View>
        <Shutter recording={recording} disabled={!ready} onPress={recording ? stop : start} />
        <View style={[styles.side, styles.right]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Choose from library" disabled={recording} onPress={library} style={[styles.library, recording && styles.dim]}>
            <LinearGradient colors={['#9fb6d1', '#4d6f97']} style={StyleSheet.absoluteFill} />
            <Icon name="photo" size={22} color="#ffffff" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** The big silver record button, a glossy capsule with a red dot. */
function Shutter({ recording, disabled, onPress }: { recording: boolean; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={recording ? 'Stop recording' : 'Record'}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.shutter, disabled && styles.dim]}>
      {({ pressed }) => (
        <>
          <LinearGradient
            colors={pressed ? ['#c9c9c9', '#a5a5a5', '#8c8c8c', '#b3b3b3'] : ['#fbfbfb', '#dcdcdc', '#b4b4b4', '#d8d8d8']}
            locations={[0, 0.48, 0.52, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.shutterWell}>
            <View style={[styles.dot, recording && styles.dotRecording]}>
              <LinearGradient colors={['#ff8a80', '#e0261a', '#a8110a']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
              <View style={styles.dotShine} />
            </View>
          </View>
        </>
      )}
    </Pressable>
  );
}

/** The red recording light next to the timer, blinking once a second. */
function Blink() {
  const [opacity] = useState(() => new Animated.Value(1));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (reduce) return;
        loop = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.15, duration: 500, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 500, useNativeDriver: true }),
          ]),
        );
        loop.start();
      });
    return () => loop?.stop();
  }, [opacity]);
  return <Animated.View style={[styles.blink, { opacity }]} />;
}

/** The black glass capsules floating over the viewfinder. */
function GlassPill({ children, ...rest }: React.ComponentProps<typeof Pressable> & { children: React.ReactNode }) {
  return (
    <Pressable accessibilityRole="button" hitSlop={8} style={[styles.pill, rest.disabled && styles.dim]} {...rest}>
      <LinearGradient colors={['rgba(90,90,90,0.75)', 'rgba(20,20,20,0.75)', 'rgba(0,0,0,0.8)']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      {children}
    </Pressable>
  );
}

/** A bordered button in the black bar style. */
function DarkButton({ title, disabled, onPress }: { title: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.dark, disabled && styles.dim]}>
      {({ pressed }) => (
        <>
          <LinearGradient
            colors={pressed ? ['#3a3a3a', '#1a1a1a', '#0a0a0a', '#050505'] : ['#6a6a6a', '#444444', '#2a2a2a', '#1f1f1f']}
            locations={[0, 0.49, 0.5, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Text style={styles.darkText}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const embossed = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: -1 }, textShadowRadius: 0 } as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  askTitle: { fontFamily, fontSize: 18, fontWeight: '700', color: '#ffffff', textAlign: 'center', ...embossed },
  askText: { fontFamily, fontSize: 15, color: '#b8bcc2', textAlign: 'center', marginBottom: 8 },
  finder: { flex: 1, overflow: 'hidden', backgroundColor: '#111111' },
  top: { position: 'absolute', left: 10, right: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pill: {
    height: 34,
    minWidth: 58,
    paddingHorizontal: 12,
    borderRadius: 17,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 1px 3px rgba(0,0,0,0.5)',
  },
  pillText: { fontFamily, fontSize: 14, fontWeight: '700', color: '#ffffff', ...embossed },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  timerText: { fontFamily, fontSize: 17, fontWeight: '700', color: '#ffffff', fontVariant: ['tabular-nums'], ...embossed },
  blink: { width: 11, height: 11, borderRadius: 6, backgroundColor: '#ff2a1f', boxShadow: '0 0 6px rgba(255,40,30,0.9)' },
  error: { position: 'absolute', left: 16, right: 16 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: '#0b0b0c',
    overflow: 'hidden',
  },
  toolbarShine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  side: { flex: 1, flexDirection: 'row' },
  right: { justifyContent: 'flex-end' },
  shutter: {
    width: 104,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2e2f31',
    boxShadow: '0 1px 0 rgba(255,255,255,0.25), 0 2px 5px rgba(0,0,0,0.6)',
  },
  shutterWell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e9e9e9',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.45), 0 1px 0 rgba(255,255,255,0.9)',
  },
  dot: { width: 24, height: 24, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#7a0c06' },
  dotRecording: { width: 18, height: 18, borderRadius: 4 },
  dotShine: { position: 'absolute', top: 1, left: 3, right: 3, height: '45%', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.45)' },
  dark: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#000000',
    boxShadow: '0 1px 0 rgba(255,255,255,0.2)',
  },
  darkText: { fontFamily, fontSize: 13, fontWeight: '700', color: '#ffffff', ...embossed },
  library: {
    width: 44,
    height: 44,
    borderRadius: 5,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#e9e9e9',
    boxShadow: '0 1px 3px rgba(0,0,0,0.7)',
  },
  dim: { opacity: 0.5 },
});
