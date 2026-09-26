/**
 * The iOS 6 progress HUD: a dark, see-through rounded square in the middle
 * of the screen with a big white spinner and a word or two ("Saving…"),
 * which can turn into a check mark ("Saved") before fading away. It blocks
 * touches while it's up. One host at the root; `showHud` from anywhere.
 */
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Spinner } from '@/components/ios6';
import { GlassSurface, glassFont, glassText, useGlassInk } from '@/components/liquid';
import { fontFamily } from '@/theme/aqua';
import { useGlass } from '@/theme/theme';

interface State {
  label: string;
  done: boolean;
}

let set: ((state: State | null) => void) | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export interface HudHandle {
  /** Shows a check mark and `label` for a moment, then fades away. */
  done: (label: string) => void;
  /** Takes it away straight away (the work failed, say). */
  hide: () => void;
}

/** Puts the HUD up with a spinner and `label` until the handle says otherwise. */
export function showHud(label: string): HudHandle {
  clearTimeout(timer);
  set?.({ label, done: false });
  return {
    done: (doneLabel) => {
      set?.({ label: doneLabel, done: true });
      timer = setTimeout(() => set?.(null), 900);
    },
    hide: () => {
      clearTimeout(timer);
      set?.(null);
    },
  };
}

/** Shows a check mark and `label` for a moment ("Copied"). */
export function flashHud(label: string) {
  clearTimeout(timer);
  set?.({ label, done: true });
  timer = setTimeout(() => set?.(null), 900);
}

/** Mounted once, over everything else at the root of the app. */
export function HudHost() {
  const [state, setState] = useState<State | null>(null);
  const [shown, setShown] = useState<State | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const glass = useGlass();
  const glassInk = useGlassInk();

  useEffect(() => {
    set = setState;
    return () => {
      set = null;
    };
  }, []);

  // Keep the last contents on screen while fading out.
  if (state && state !== shown) setShown(state);

  useEffect(() => {
    Animated.timing(opacity, { toValue: state ? 1 : 0, duration: state ? 120 : 250, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !state) setShown(null);
    });
  }, [state, opacity]);

  if (!shown) return null;
  const ink = glass ? glassInk.primary : '#ffffff';
  return (
    <View style={styles.cover} pointerEvents={state ? 'auto' : 'none'}>
      <Animated.View style={[styles.box, glass && styles.boxGlass, { opacity }]} accessibilityLiveRegion="polite" accessible accessibilityLabel={shown.label}>
        {glass ? <GlassSurface radius={30} style={StyleSheet.absoluteFill} /> : null}
        {shown.done ? (
          <Icon name="check" size={40} strokeWidth={3.2} color={ink} />
        ) : (
          <Spinner size="large" color={glass ? glassInk.secondary : '#ffffff'} accessibilityLabel={shown.label} />
        )}
        <Text style={[styles.label, glass && styles.labelGlass]}>{shown.label}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  box: {
    minWidth: 130,
    minHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  boxGlass: { backgroundColor: 'transparent', borderRadius: 30 },
  labelGlass: { fontFamily: glassFont, fontWeight: '600', color: glassText.primary, textShadowColor: 'transparent' },
  label: {
    fontFamily,
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: -1 },
    textShadowRadius: 0,
  },
});
