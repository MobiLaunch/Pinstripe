/**
 * The iOS 6 camera iris: six dark blades that swirl open when the camera
 * starts and closed when it's done. Drawn as the outside of a hexagonal
 * aperture, each blade the half-plane beyond one edge, so they overlap into
 * a pinwheel as the hexagon turns and grows.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

const BLADES = 6;
const deg = Math.PI / 180;

export function Iris({ open, onSettled }: { open: boolean; onSettled?: () => void }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [amount] = useState(() => new Animated.Value(open ? 1 : 0));
  const [p, setP] = useState(open ? 1 : 0);

  useEffect(() => {
    const id = amount.addListener(({ value }) => setP(value));
    return () => amount.removeListener(id);
  }, [amount]);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((reduce) => {
        if (cancelled) return;
        Animated.timing(amount, {
          toValue: open ? 1 : 0,
          duration: reduce ? 0 : open ? 450 : 320,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: false,
        }).start(({ finished }) => finished && onSettled?.());
      });
    return () => {
      cancelled = true;
    };
    // onSettled changes every render; only a change of `open` starts a move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, amount]);

  const { width, height } = size;
  const blades: string[] = [];
  if (width && p < 1) {
    const cx = width / 2;
    const cy = height / 2;
    const diagonal = Math.hypot(width, height);
    // Fully open, the hexagon's inner circle clears the corners.
    const a = (p * diagonal) / 2 / Math.cos(30 * deg) + 1;
    const turn = (1 - p) * 55;
    const far = diagonal * 2;
    for (let i = 0; i < BLADES; i++) {
      const phi = (turn + i * 60) * deg;
      const vx = cx + a * Math.cos(phi);
      const vy = cy + a * Math.sin(phi);
      const ex = Math.cos(phi + 120 * deg);
      const ey = Math.sin(phi + 120 * deg);
      const nx = Math.cos(phi + 30 * deg);
      const ny = Math.sin(phi + 30 * deg);
      const pts = [
        [vx, vy],
        [vx + ex * far, vy + ey * far],
        [vx + ex * far + nx * far, vy + ey * far + ny * far],
        [vx + nx * far, vy + ny * far],
      ];
      blades.push(`M${pts.map(([x, y]) => `${x!.toFixed(1)} ${y!.toFixed(1)}`).join(' L')} Z`);
    }
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setSize(e.nativeEvent.layout)}>
      {blades.length ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="blade" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#6a6c70" />
              <Stop offset="0.5" stopColor="#3b3d41" />
              <Stop offset="1" stopColor="#222326" />
            </LinearGradient>
          </Defs>
          {blades.map((d, i) => (
            <Path key={i} d={d} fill="url(#blade)" stroke="#111214" strokeWidth={1.5} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}
