/**
 * Liquid Glass, the look the Glass theme uses in place of iOS 6 chrome.
 *
 * GlassSurface is the material: on iOS 26 and later it is Apple's own
 * (UIGlassEffect, through expo-glass-effect), which bends and brightens
 * what's behind it. Elsewhere it is built from a backdrop blur, a light or
 * dark tint, a bright rim and a specular highlight across the top, so the
 * app reads the same on Android and the web.
 */
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Platform, type StyleProp, StyleSheet, useColorScheme, View, type ViewProps, type ViewStyle } from 'react-native';

import { Texture } from '@/components/texture';
import { themed } from '@/theme/appearance';

const nativeGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * The system's colours for text and surfaces on glass, light and dark
 * (they follow the appearance by themselves; see theme/appearance.ts).
 */
export const glassText = {
  primary: themed('g-primary', '#000000', '#ffffff'),
  secondary: themed('g-secondary', 'rgba(60,60,67,0.6)', 'rgba(235,235,245,0.6)'),
  tertiary: themed('g-tertiary', 'rgba(60,60,67,0.3)', 'rgba(235,235,245,0.3)'),
  separator: themed('g-separator', 'rgba(60,60,67,0.29)', 'rgba(84,84,88,0.65)'),
  groupedBackground: themed('g-grouped', '#f2f2f7', '#000000'),
  /** Cells, cards and groups. */
  surface: themed('g-surface', '#ffffff', '#1c1c1e'),
  surfacePressed: themed('g-surface-pressed', '#e5e5ea', '#2c2c2e'),
  /** The frosted strip behind navigation bars. */
  bar: themed('g-bar', 'rgba(242,242,247,0.92)', 'rgba(0,0,0,0.82)'),
  fill: themed('g-fill', 'rgba(120,120,128,0.16)', 'rgba(120,120,128,0.36)'),
  /** The segmented control's sliding capsule. */
  thumb: themed('g-thumb', '#ffffff', '#636366'),
  blue: '#0a84ff',
  red: '#ff3b30',
  green: '#34c759',
} as const;

/** Plain colours for the current appearance, for icons (SVG can't take system-resolved colours). */
export function useGlassInk(): { primary: string; secondary: string } {
  return useColorScheme() === 'dark'
    ? { primary: '#ffffff', secondary: 'rgba(235,235,245,0.6)' }
    : { primary: '#000000', secondary: 'rgba(60,60,67,0.6)' };
}

/** The system font, which the Glass look uses throughout. */
export const glassFont = Platform.select({ web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif', default: undefined });

export function GlassSurface({
  children,
  style,
  radius,
  dark = false,
  tint,
  interactive = false,
  ...rest
}: ViewProps & {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Corner radius; half the height makes a capsule. */
  radius: number;
  /** Glass over dark content (video): darker body, subtler rim. */
  dark?: boolean;
  /** Tinted glass (a filled button): the colour shows through the material. */
  tint?: string;
  interactive?: boolean;
}) {
  // Glass darkens with the system appearance, or when it sits over dark content.
  const scheme = useColorScheme();
  const isDark = dark || scheme === 'dark';
  if (nativeGlass) {
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={dark ? 'dark' : 'auto'}
        tintColor={tint}
        isInteractive={interactive}
        style={[{ borderRadius: radius, overflow: 'hidden' }, style]}
        {...rest}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[styles.surface, isDark ? styles.surfaceDark : styles.surfaceLight, { borderRadius: radius }, style]} {...rest}>
      <BlurView intensity={isDark ? 40 : 55} tint={isDark ? 'dark' : 'light'} experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint ?? (isDark ? 'rgba(40,40,46,0.35)' : 'rgba(255,255,255,0.5)'), opacity: tint ? 0.88 : 1 }]} pointerEvents="none" />
      {/* The specular highlight: light caught along the top edge. */}
      <LinearGradient
        colors={isDark ? ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)'] : ['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']}
        locations={[0, 0.55]}
        style={[StyleSheet.absoluteFill, { borderRadius: radius }]}
        pointerEvents="none"
      />
      <View style={[StyleSheet.absoluteFill, styles.rim, isDark ? styles.rimDark : null, { borderRadius: radius }]} pointerEvents="none" />
      {children}
    </View>
  );
}

const WALLPAPER = require('../../assets/textures/wallpaper.png');

/**
 * The backdrop glass sits over where a screen has no content of its own
 * (notifications, the desktop margin): a soft, colourful wallpaper, so the
 * glass has something to bend.
 */
export function Wallpaper({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[styles.wallpaper, style]} {...rest}>
      <Texture source={WALLPAPER} tile={{ width: 1024, height: 1024 }} cover />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: { overflow: 'hidden' },
  surfaceLight: { boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)' },
  surfaceDark: { boxShadow: '0 8px 24px rgba(0,0,0,0.3)' },
  rim: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.75)', borderBottomColor: 'rgba(255,255,255,0.35)' },
  rimDark: { borderColor: 'rgba(255,255,255,0.28)', borderBottomColor: 'rgba(255,255,255,0.1)' },
  wallpaper: { flex: 1, backgroundColor: '#1d2b5a' },
});
