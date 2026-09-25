import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, Pattern, Polygon, Rect } from 'react-native-svg';

import { colors } from '@/theme/aqua';

const STRIPE = 14;

/**
 * The Aqua barber-pole progress bar from the design. `progress` 0–1, or
 * null for "working, can't say how long" (the stripes still move). Motion
 * stops when the system asks for reduced motion.
 */
export function ProgressBar({ progress, label }: { progress: number | null; label: string }) {
  const shift = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.timing(shift, { toValue: STRIPE * 2, duration: 1000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [shift, reduceMotion]);

  const pct = progress === null ? 100 : Math.round(Math.max(0, Math.min(1, progress)) * 100);
  return (
    <View
      style={styles.track}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={progress === null ? undefined : { min: 0, max: 100, now: pct }}>
      <View style={[styles.fill, { width: `${pct}%` }]}>
        <Animated.View style={[styles.stripes, { transform: [{ translateX: shift }] }]}>
          <Svg width="200%" height="100%">
            <Defs>
              <Pattern id="barber" width={STRIPE * 2} height={STRIPE * 2} patternUnits="userSpaceOnUse">
                <Rect width={STRIPE * 2} height={STRIPE * 2} fill="#8ac3ff" />
                <Polygon points={`0,${STRIPE * 2} ${STRIPE},0 ${STRIPE * 2},0 ${STRIPE},${STRIPE * 2}`} fill={colors.accent} />
              </Pattern>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#barber)" />
          </Svg>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 12, borderRadius: 6, borderWidth: 1, borderColor: '#555555', overflow: 'hidden', backgroundColor: '#dcdcdc' },
  fill: { height: '100%', overflow: 'hidden', borderRadius: 5 },
  stripes: { position: 'absolute', top: 0, bottom: 0, left: -STRIPE * 2, width: '200%' },
});
