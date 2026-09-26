/**
 * The iOS 6 alert view: a navy glass box with a glossy top, white text and
 * glassy buttons, popping in with a little bounce. One host at the root
 * shows them; `showDialog` (and `confirm`) ask from anywhere.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassSurface, glassFont, glassText } from '@/components/liquid';
import { fontFamily } from '@/theme/aqua';
import { useGlass } from '@/theme/theme';

export interface DialogButton {
  label: string;
  /** cancel: the darker one; destructive: red; default: the plain glass. */
  style?: 'cancel' | 'default' | 'destructive';
}

interface Request {
  title: string;
  message?: string;
  buttons: DialogButton[];
  resolve: (index: number) => void;
}

let show: ((request: Request) => void) | null = null;
const waiting: Request[] = [];

/** Shows an alert and resolves with the index of the button pressed. */
export function showDialog(title: string, message: string | undefined, buttons: DialogButton[] = [{ label: 'OK' }]): Promise<number> {
  return new Promise((resolve) => {
    const request = { title, message, buttons, resolve };
    if (show) show(request);
    else waiting.push(request);
  });
}

/** Mounted once, at the root of the app. */
export function DialogHost() {
  const [queue, setQueue] = useState<Request[]>([]);
  const current = queue[0] ?? null;

  useEffect(() => {
    show = (request) => setQueue((q) => [...q, request]);
    if (waiting.length) setQueue((q) => [...q, ...waiting.splice(0)]);
    return () => {
      show = null;
    };
  }, []);

  const answer = (index: number) => {
    current?.resolve(index);
    setQueue((q) => q.slice(1));
  };

  if (!current) return null;
  const cancel = current.buttons.findIndex((b) => b.style === 'cancel');
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => answer(cancel >= 0 ? cancel : 0)}>
      <AlertView request={current} onAnswer={answer} />
    </Modal>
  );
}

function AlertView({ request, onAnswer }: { request: Request; onAnswer: (index: number) => void }) {
  const glass = useGlass();
  const [scale] = useState(() => new Animated.Value(0.6));
  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        if (reduce) return scale.setValue(1);
        // The iOS 6 pop: overshoot, settle back, land.
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.08, duration: 130, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.96, duration: 90, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: true }),
        ]).start();
      });
    return () => {
      cancelled = true;
    };
  }, [scale]);

  const side = request.buttons.length === 2;
  if (glass) {
    return (
      <View style={[styles.backdrop, glassStyles.backdrop]}>
        <Animated.View style={[glassStyles.alert, { transform: [{ scale }] }]} accessibilityViewIsModal accessibilityRole="alert">
          <GlassSurface radius={34} style={StyleSheet.absoluteFill} />
          <Text style={glassStyles.title}>{request.title}</Text>
          {request.message ? <Text style={glassStyles.message}>{request.message}</Text> : null}
          <View style={[glassStyles.buttons, side && styles.buttonsSide]}>
            {request.buttons.map((b, i) => {
              // The choice that goes ahead is filled; Cancel stays clear.
              const filled = b.style !== 'cancel' && (b.style === 'destructive' || i === request.buttons.length - 1);
              return (
                <Pressable
                  key={b.label}
                  accessibilityRole="button"
                  onPress={() => onAnswer(i)}
                  style={({ pressed }) => [
                    glassStyles.button,
                    side && styles.buttonSide,
                    filled && { backgroundColor: b.style === 'destructive' ? glassText.red : glassText.blue },
                    pressed && glassStyles.pressed,
                  ]}>
                  <Text style={[glassStyles.buttonText, filled && glassStyles.buttonTextFilled]}>{b.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </View>
    );
  }
  return (
    <View style={styles.backdrop}>
      <LinearGradient colors={['rgba(0,0,0,0.2)', 'rgba(0,0,0,0.55)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <Animated.View style={[styles.alert, { transform: [{ scale }] }]} accessibilityViewIsModal accessibilityRole="alert">
        <View style={styles.gloss} pointerEvents="none" />
        <Text style={styles.title}>{request.title}</Text>
        {request.message ? <Text style={styles.message}>{request.message}</Text> : null}
        <View style={[styles.buttons, side && styles.buttonsSide]}>
          {request.buttons.map((b, i) => (
            <Pressable
              key={b.label}
              accessibilityRole="button"
              onPress={() => onAnswer(i)}
              style={({ pressed }) => [styles.button, side && styles.buttonSide, pressed && styles.buttonPressed]}>
              <LinearGradient colors={FACES[b.style ?? 'default']} locations={[0, 0.5, 0.5, 1]} style={[StyleSheet.absoluteFill, styles.buttonFace]} />
              <Text style={styles.buttonText}>{b.label}</Text>
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const FACES = {
  default: ['rgba(255,255,255,0.42)', 'rgba(255,255,255,0.2)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.16)'],
  cancel: ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.02)'],
  destructive: ['#f0918a', '#dc3f33', '#c5241a', '#b91a10'],
} as const;

const embossed = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: -1 }, textShadowRadius: 0 } as const;

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  alert: {
    width: 284,
    maxWidth: '100%',
    paddingTop: 18,
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(235,240,250,0.85)',
    backgroundColor: 'rgba(5,24,63,0.86)',
    overflow: 'hidden',
    boxShadow: '0 4px 14px rgba(0,0,0,0.6), inset 0 0 1px rgba(255,255,255,0.6)',
  },
  // The big curved shine across the top half.
  gloss: {
    position: 'absolute',
    top: -140,
    left: -60,
    right: -60,
    height: 190,
    borderBottomLeftRadius: 400,
    borderBottomRightRadius: 400,
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  title: { fontFamily, fontSize: 18, fontWeight: '700', color: '#ffffff', textAlign: 'center', ...embossed },
  message: { fontFamily, fontSize: 16, lineHeight: 21, color: '#ffffff', textAlign: 'center', marginTop: 8, ...embossed },
  buttons: { marginTop: 18, gap: 8 },
  buttonsSide: { flexDirection: 'row' },
  button: {
    height: 43,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: '0 1px 0 rgba(255,255,255,0.25), inset 0 1px 0 rgba(255,255,255,0.35)',
  },
  buttonSide: { flex: 1 },
  buttonPressed: { backgroundColor: 'rgba(0,0,0,0.35)' },
  buttonFace: { borderRadius: 5 },
  buttonText: { fontFamily, fontSize: 18, fontWeight: '700', color: '#ffffff', ...embossed },
});

const glassStyles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.2)' },
  alert: { width: 300, maxWidth: '100%', paddingTop: 22, paddingHorizontal: 18, paddingBottom: 16, borderRadius: 34 },
  title: { fontFamily: glassFont, fontSize: 17, fontWeight: '600', color: glassText.primary, textAlign: 'center' },
  message: { fontFamily: glassFont, fontSize: 15, lineHeight: 20, color: glassText.primary, textAlign: 'center', marginTop: 6 },
  buttons: { marginTop: 18, gap: 8 },
  button: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(120,120,128,0.16)' },
  pressed: { transform: [{ scale: 0.96 }], opacity: 0.85 },
  buttonText: { fontFamily: glassFont, fontSize: 17, fontWeight: '600', color: glassText.primary },
  buttonTextFilled: { color: '#ffffff' },
});
