/**
 * M3 Expressive's loading indicator (a shape that turns and morphs through
 * the Material shapes: soft burst, cookie, pentagon, pill, sunny) and its
 * wavy progress bar.
 */
import { useEffect, useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { useReduceMotion } from '@/components/glass-motion';
import { useM3 } from '@/theme/m3';

const POINTS = 96;

/** Each shape as a radius for an angle (1 at its widest). */
const SHAPES: ((a: number) => number)[] = [
  (a) => 1 + 0.09 * Math.cos(10 * a), // soft burst
  (a) => 1 + 0.08 * Math.cos(9 * a), // 9-sided cookie
  (a) => 1 + 0.11 * Math.cos(5 * a), // pentagon
  (a) => 1 / Math.sqrt(Math.cos(a) ** 2 + (Math.sin(a) / 0.66) ** 2), // pill
  (a) => 1 + 0.05 * Math.cos(8 * a), // sunny
  (a) => 1 + 0.14 * Math.cos(4 * a), // 4-sided cookie
];

const SAMPLED = SHAPES.map((shape) => {
  const radii = Array.from({ length: POINTS }, (_, i) => shape((i / POINTS) * Math.PI * 2));
  const max = Math.max(...radii);
  return radii.map((r) => r / max);
});

/** One of the Material shapes as an SVG path, for decoration (see the profile banner). */
export function shapePath(index: number, radius: number, cx: number, cy: number, turn = 0): string {
  const radii = SAMPLED[index % SAMPLED.length]!;
  let d = '';
  for (let i = 0; i < POINTS; i++) {
    const a = (i / POINTS) * Math.PI * 2 + turn;
    d += `${i ? 'L' : 'M'}${(cx + radius * radii[i]! * Math.cos(a)).toFixed(1)} ${(cy + radius * radii[i]! * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function morphPath(time: number, radius: number, centre: number): string {
  const HOLD = 0.35;
  const STEP = 1.1; // seconds per shape
  const index = Math.floor(time / STEP) % SAMPLED.length;
  const within = (time % STEP) / STEP;
  const t = within < HOLD ? 0 : ease((within - HOLD) / (1 - HOLD));
  const from = SAMPLED[index]!;
  const to = SAMPLED[(index + 1) % SAMPLED.length]!;
  // It turns as it goes, a little faster while morphing.
  const turn = time * 1.6 + t * 0.9;
  let d = '';
  for (let i = 0; i < POINTS; i++) {
    const a = (i / POINTS) * Math.PI * 2 + turn;
    const r = radius * (from[i]! + (to[i]! - from[i]!) * t);
    d += `${i ? 'L' : 'M'}${(centre + r * Math.cos(a)).toFixed(2)} ${(centre + r * Math.sin(a)).toFixed(2)}`;
  }
  return `${d}Z`;
}

/** Re-renders every frame while mounted; returns seconds since mount. */
function useClock(running: boolean): number {
  const [time, setTime] = useState(0);
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    const start = Date.now();
    const tick = () => {
      setTime((Date.now() - start) / 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);
  return time;
}

export function LoadingIndicator({
  size = 48,
  color,
  contained = false,
  style,
  accessibilityLabel = 'Loading',
}: {
  size?: number;
  color?: string;
  /** On a round container, for loading over content. */
  contained?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { c } = useM3();
  const reduce = useReduceMotion();
  const time = useClock(!reduce);
  const centre = size / 2;
  const radius = size * (contained ? 0.3 : 0.4);
  return (
    <View style={[{ width: size, height: size, alignSelf: 'center' }, style]} accessibilityRole="progressbar" accessibilityLabel={accessibilityLabel}>
      <Svg width={size} height={size}>
        {contained ? <Circle cx={centre} cy={centre} r={centre} fill={c.primaryContainer} /> : null}
        <Path d={morphPath(time, radius, centre)} fill={color ?? (contained ? c.onPrimaryContainer : c.primary)} />
      </Svg>
    </View>
  );
}

const HEIGHT = 12;
const WAVELENGTH = 36;
const AMPLITUDE = 3;
const STROKE = 4;
const GAP = 6;

function wave(from: number, to: number, phase: number): string {
  if (to - from < 1) return '';
  let d = '';
  for (let x = from; x <= to; x += 2) {
    const y = HEIGHT / 2 + AMPLITUDE * Math.sin(((x - phase) / WAVELENGTH) * Math.PI * 2);
    d += `${x === from ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(2)}`;
  }
  return d;
}

/** The wavy progress bar: a travelling wave for what's done, a flat track and a stop dot for the rest. `null` is indeterminate. */
export function WavyProgress({ progress, label }: { progress: number | null; label: string }) {
  const { c } = useM3();
  const [width, setWidth] = useState(0);
  const reduce = useReduceMotion();
  const time = useClock(!reduce);
  const phase = time * 40;
  let active: string;
  let track: [number, number];
  if (progress === null) {
    // A stretch of wave that sweeps across.
    const span = width * 0.4;
    const head = ((time * 0.8) % 1) * (width + span);
    const start = Math.max(STROKE / 2, head - span);
    const end = Math.min(width - STROKE / 2, head);
    active = wave(start, end, phase);
    track = [end + GAP, width - STROKE / 2];
  } else {
    const end = Math.max(STROKE / 2, Math.min(1, progress) * width - STROKE / 2);
    active = progress > 0 ? wave(STROKE / 2, end, phase) : '';
    track = [end + (progress > 0 ? GAP : 0), width - STROKE / 2];
  }
  return (
    <View
      style={{ height: HEIGHT, alignSelf: 'stretch' }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={progress === null ? undefined : { min: 0, max: 100, now: Math.round(progress * 100) }}>
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          {track[1] > track[0] ? (
            <Path d={`M${track[0]} ${HEIGHT / 2}L${track[1]} ${HEIGHT / 2}`} stroke={c.secondaryContainer} strokeWidth={STROKE} strokeLinecap="round" />
          ) : null}
          {progress !== null && progress < 1 ? <Circle cx={width - STROKE / 2} cy={HEIGHT / 2} r={STROKE / 2} fill={c.primary} /> : null}
          {active ? <Path d={active} stroke={c.primary} strokeWidth={STROKE} strokeLinecap="round" fill="none" /> : null}
        </Svg>
      ) : null}
    </View>
  );
}
