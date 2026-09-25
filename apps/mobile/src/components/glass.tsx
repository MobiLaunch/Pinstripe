/**
 * Glass, drawn rather than approximated: the specular highlight follows the
 * control's own outline across the top (round on an orb, capsule on a
 * pill, rounded corners on a rectangle) and ends in a soft curve, and orbs
 * catch light at the bottom too, the way iOS 6's glossy buttons did.
 */
import { useId, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

/**
 * The highlight's outline for a w×h shape with corner radius r: the shape's
 * top, inset a little, down to about half its height, closed by a gentle
 * downward curve.
 */
export function glossPath(w: number, h: number, r: number, inset = 1.5, depth = 0.5): string {
  const R = Math.max(0, Math.min(r, h / 2, w / 2) - inset);
  const x0 = inset;
  const x1 = w - inset;
  const y0 = inset;
  const bottom = h * depth;
  const sag = h * 0.07;
  const top = `A${R} ${R} 0 0 1 ${x0 + R} ${y0} L${x1 - R} ${y0} A${R} ${R} 0 0 1`;
  if (bottom <= y0 + R && R > 0) {
    // The lower edge meets the curved corners.
    const dy = y0 + R - bottom;
    const dx = Math.sqrt(Math.max(0, R * R - dy * dy));
    const left = `${x0 + R - dx} ${bottom}`;
    const right = `${x1 - R + dx} ${bottom}`;
    return `M${left} ${top} ${right} Q${w / 2} ${bottom + sag} ${left} Z`;
  }
  return `M${x0} ${bottom} L${x0} ${y0 + R} ${top} ${x1} ${y0 + R} L${x1} ${bottom} Q${w / 2} ${bottom + sag} ${x0} ${bottom} Z`;
}

function useSvgId() {
  return useId().replace(/[^a-zA-Z0-9]/g, '');
}

/** The highlight alone, over a control of known size. */
export function Gloss({ width, height, radius, strength = 0.85, depth }: { width: number; height: number; radius: number; strength?: number; depth?: number }) {
  const id = useSvgId();
  if (!width || !height) return null;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={strength} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={strength * 0.12} />
        </LinearGradient>
      </Defs>
      <Path d={glossPath(width, height, radius, 1.5, depth)} fill={`url(#g${id})`} />
    </Svg>
  );
}

/** The highlight over a control that sizes itself (a pill, a bar button). */
export function FitGloss({ radius, strength, depth }: { radius: number | 'pill'; strength?: number; depth?: number }) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width !== size.width || height !== size.height) setSize({ width, height });
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      <Gloss width={size.width} height={size.height} radius={radius === 'pill' ? size.height / 2 : radius} strength={strength} depth={depth} />
    </View>
  );
}

/**
 * A glass orb's face: a deep body lit from below (the light that comes
 * through glass and pools at the bottom), a crisp rim, and the highlight
 * hugging the top of the circle.
 */
export function OrbFace({ size, colors, pressed = false }: { size: number; colors: readonly [string, string, ...string[]]; pressed?: boolean }) {
  const id = useSvgId();
  const light = colors[0];
  const dark = colors[colors.length - 1]!;
  const r = size / 2;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <RadialGradient id={`b${id}`} cx="50%" cy="100%" rx="75%" ry="85%" fx="50%" fy="100%">
          <Stop offset="0" stopColor={light} />
          <Stop offset="0.55" stopColor={dark} />
          <Stop offset="1" stopColor={dark} />
        </RadialGradient>
        <LinearGradient id={`h${id}`} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffffff" stopOpacity={pressed ? 0.55 : 0.85} />
          <Stop offset="1" stopColor="#ffffff" stopOpacity={0.08} />
        </LinearGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r - 0.5} fill={`url(#b${id})`} />
      {pressed ? <Circle cx={r} cy={r} r={r - 0.5} fill="rgba(0,0,0,0.28)" /> : null}
      <Path d={glossPath(size, size, r, size * 0.06, 0.52)} fill={`url(#h${id})`} />
      <Circle cx={r} cy={r} r={r - 0.75} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
    </Svg>
  );
}
