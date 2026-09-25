/**
 * iOS 6 pull to refresh (UIRefreshControl): pulling a list down past its top
 * reveals a grey drop with a refresh arrow, which stretches like gum the
 * further you pull, snaps, and turns into the spinner while the list reloads.
 *
 * The drop needs the scroll view to bounce past its top, which only iOS
 * does; elsewhere the platform's RefreshControl stands in.
 */
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Platform,
  RefreshControl,
  type ScrollViewProps,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { Spinner } from '@/components/ios6';
import { play } from '@/sound/sounds';

const RADIUS = 15;
const TOP = 8;
/** How far the drop stretches before it snaps. */
const STRETCH = 64;
/** Pull distance at which the drop is a whole circle and starts to stretch. */
const FULL = TOP + RADIUS * 2 + 8;
const SNAP = FULL + STRETCH;
/** Room the spinner keeps at the top while refreshing. */
const HOLD = 48;

type ListProps = Pick<ScrollViewProps, 'refreshControl' | 'onScroll' | 'onScrollBeginDrag' | 'onScrollEndDrag' | 'scrollEventThrottle' | 'contentInset'>;

/**
 * Hands a list its pull-to-refresh: spread `listProps` onto the FlatList and
 * put `header` first in its ListHeaderComponent. `busy` is an outside
 * refresh in progress (say, a list hook's own refreshing flag).
 */
export function usePullToRefresh(onRefresh: () => unknown, busy = false): { listProps: ListProps; header: ReactNode } {
  const [running, setRunning] = useState(false);
  const refreshing = running || busy;
  const [pull] = useState(() => new Animated.Value(0));
  const dragging = useRef(false);
  const fired = useRef(false);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      await onRefresh();
    } finally {
      setRunning(false);
    }
  }, [onRefresh]);

  if (Platform.OS !== 'ios') {
    return {
      listProps: { refreshControl: <RefreshControl refreshing={refreshing} onRefresh={run} colors={['#5d7495']} progressBackgroundColor="#ffffff" /> },
      header: null,
    };
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const distance = -e.nativeEvent.contentOffset.y;
    pull.setValue(distance);
    // It refreshes the moment it snaps, while your finger is still down.
    if (dragging.current && !fired.current && !refreshing && distance >= SNAP) {
      fired.current = true;
      play('pop');
      run();
    }
  };

  return {
    listProps: {
      onScroll,
      scrollEventThrottle: 16,
      onScrollBeginDrag: () => {
        dragging.current = true;
        fired.current = false;
      },
      onScrollEndDrag: () => {
        dragging.current = false;
      },
      contentInset: refreshing ? { top: HOLD } : undefined,
    },
    header: <PullHeader pull={pull} refreshing={refreshing} />,
  };
}

function PullHeader({ pull, refreshing }: { pull: Animated.Value; refreshing: boolean }) {
  const [distance, setDistance] = useState(0);
  useEffect(() => {
    const id = pull.addListener(({ value }) => setDistance(Math.max(0, value)));
    return () => pull.removeListener(id);
  }, [pull]);

  // Hangs above the list's first row, in the space the bounce opens up.
  if (refreshing) {
    return (
      <View style={styles.anchor} pointerEvents="none">
        <View style={[styles.area, { top: -HOLD, height: HOLD }]}>
          <Spinner accessibilityLabel="Refreshing" />
        </View>
      </View>
    );
  }
  if (distance <= 0) return null;
  return (
    <View style={styles.anchor} pointerEvents="none">
      <View style={[styles.area, styles.dropArea, { top: -distance, height: distance }]}>
        <Gumdrop distance={distance} />
      </View>
    </View>
  );
}

/** The drop itself, drawn for how far the list has been pulled. */
export function Gumdrop({ distance }: { distance: number }) {
  const stretch = Math.min(STRETCH, Math.max(0, distance - FULL));
  const p = stretch / STRETCH;
  const R = RADIUS - 4 * p;
  const r = RADIUS - 11 * p;
  const width = RADIUS * 2 + 4;
  const cx = width / 2;
  const cy1 = TOP + R;
  const cy2 = cy1 + stretch;
  const mid = (cy1 + cy2) / 2;
  const drop =
    `M${cx - R} ${cy1} A${R} ${R} 0 1 1 ${cx + R} ${cy1} ` +
    `Q${cx + r} ${mid} ${cx + r} ${cy2} A${r} ${r} 0 1 1 ${cx - r} ${cy2} Q${cx - r} ${mid} ${cx - R} ${cy1} Z`;
  // The refresh arrow: three quarters of a circle and a head pointing on round.
  const a = R * 0.45;
  const h = a * 0.8;
  const arrow = `M${cx} ${cy1 - a} A${a} ${a} 0 1 1 ${cx - a} ${cy1}`;
  const head = `M${cx - a} ${cy1 - h} L${cx - a - h * 0.8} ${cy1 + h * 0.15} L${cx - a + h * 0.8} ${cy1 + h * 0.15} Z`;
  // Scale in as the circle first appears.
  const scale = Math.min(1, distance / FULL);
  const height = cy2 + r + 2;
  return (
    <Svg width={width} height={height} style={{ transform: [{ scale }] }}>
      <Defs>
        <LinearGradient id="gumdrop" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#b9bec6" />
          <Stop offset="1" stopColor="#8f96a0" />
        </LinearGradient>
      </Defs>
      <Path d={drop} fill="url(#gumdrop)" stroke="#6c737d" strokeWidth={1} />
      <Path d={arrow} fill="none" stroke="#ffffff" strokeWidth={Math.max(1.5, R * 0.2)} strokeLinecap="round" />
      <Path d={head} fill="#ffffff" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  anchor: { height: 0, zIndex: 1 },
  area: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  dropArea: { justifyContent: 'flex-start', overflow: 'hidden' },
});
