/**
 * Liquid Glass motion: glass that swells a little under your finger and
 * springs back when you let go. Everything here stands still when the
 * system asks for reduced motion.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, type GestureResponderEvent } from 'react-native';

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

type PressHandler = ((event: GestureResponderEvent) => void) | null | undefined;

/**
 * The press swell. Spread `handlers` onto the Pressable (the caller's own
 * onPressIn/onPressOut still run) and `scale` into the glass's transform.
 */
export function useSwell({ onPressIn, onPressOut, to = 1.07 }: { onPressIn?: PressHandler; onPressOut?: PressHandler; to?: number } = {}) {
  const [scale] = useState(() => new Animated.Value(1));
  const reduce = useReduceMotion();
  return {
    scale,
    handlers: {
      onPressIn: (e: GestureResponderEvent) => {
        if (!reduce) Animated.spring(scale, { toValue: to, speed: 40, bounciness: 4, useNativeDriver: true }).start();
        onPressIn?.(e);
      },
      onPressOut: (e: GestureResponderEvent) => {
        Animated.spring(scale, { toValue: 1, speed: 16, bounciness: reduce ? 0 : 12, useNativeDriver: true }).start();
        onPressOut?.(e);
      },
    },
  };
}
