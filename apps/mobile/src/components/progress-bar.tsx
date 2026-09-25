import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, Pattern, Polygon, Rect } from 'react-native-svg';

import { useAccent } from '@/theme/theme';

const STRIPE = 10;

/**
 * The iOS 6 progress bar (UIProgressView): a grey track pressed into the
 * page and a glossy pill of the theme's blue filling it. `progress` 0–1, or
 * null for "working, can't say how long", when the whole bar fills with
 * moving diagonal stripes. Motion stops when the system asks for reduced
 * motion.
 */
export function ProgressBar({ progress, label }: { progress: number | null; label: string }) {
  const accent = useAccent();
  const [shift] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);
  const indeterminate = progress === null;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion || !indeterminate) return;
    const loop = Animated.loop(
      Animated.timing(shift, { toValue: STRIPE * 2, duration: 700, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [shift, reduceMotion, indeterminate]);

  const pct = indeterminate ? 100 : Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={indeterminate ? undefined : { min: 0, max: 100, now: pct }}>
      <LinearGradient colors={['#b4b8be', '#d9dce0', '#eceef0']} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      {pct > 0 ? (
        <View style={[styles.fill, { width: `${pct}%`, minWidth: 10, borderColor: accent.gelBorder }]}>
          <LinearGradient colors={accent.gel.colors} locations={accent.gel.locations} style={StyleSheet.absoluteFill} />
          {indeterminate ? (
            <Animated.View style={[styles.stripes, { transform: [{ translateX: shift }] }]}>
              <Svg width="100%" height="100%">
                <Defs>
                  <Pattern id="progressStripes" width={STRIPE * 2} height={STRIPE * 2} patternUnits="userSpaceOnUse">
                    <Polygon points={`0,${STRIPE * 2} ${STRIPE},0 ${STRIPE * 2},0 ${STRIPE},${STRIPE * 2}`} fill="rgba(255,255,255,0.28)" />
                  </Pattern>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#progressStripes)" />
              </Svg>
            </Animated.View>
          ) : null}
          <View style={styles.gloss} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 11,
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#8b9098',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.8)',
  },
  fill: { height: '100%', borderRadius: 5, overflow: 'hidden', borderWidth: 1 },
  stripes: { position: 'absolute', top: 0, bottom: 0, left: -STRIPE * 2, right: 0 },
  gloss: { position: 'absolute', top: 0, left: 2, right: 2, height: '48%', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.35)' },
});
