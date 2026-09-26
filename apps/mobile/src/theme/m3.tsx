/**
 * Material 3 Expressive, for the Android look: the colour scheme, the type
 * scale, shapes and springs.
 *
 * Colours are Material You. On Android 12 and later they come from the
 * wallpaper, as every Pixel app's do; people can pick a seed colour instead
 * in Settings (and the web preview always uses one). Light and dark follow
 * the system, live.
 */
import { argbFromHex, Hct, hexFromArgb, MaterialDynamicColors, SchemeContent } from '@material/material-color-utilities';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Animated, useColorScheme } from 'react-native';

import { getJson, setJson } from '@/auth/storage';

import { dynamicColorAvailable, wallpaperColors } from './m3-dynamic';

const ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'inversePrimary',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'background', 'onBackground', 'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'surfaceDim', 'surfaceBright', 'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
  'surfaceContainerHigh', 'surfaceContainerHighest', 'inverseSurface', 'inverseOnSurface',
  'outline', 'outlineVariant', 'scrim',
] as const;

export type M3Role = (typeof ROLES)[number];
export type M3Colors = Record<M3Role, string> & {
  /** Classic Twitter's colours for a retweet (boost) and a like, kept whatever the palette. */
  boost: string;
  like: string;
};

/** Seeds to choose from when not using the wallpaper, like a Pixel's "Basic colours". */
export const SEEDS = [
  { value: 'wallpaper', label: 'Wallpaper', color: '' },
  { value: '#2a74d6', label: 'Pinstripe', color: '#2a74d6' },
  { value: '#1da1f2', label: 'Bird', color: '#1da1f2' },
  { value: '#3f8a4f', label: 'Fern', color: '#3f8a4f' },
  { value: '#7a5fc0', label: 'Lavender', color: '#7a5fc0' },
  { value: '#c2477a', label: 'Rose', color: '#c2477a' },
  { value: '#b8860b', label: 'Amber', color: '#b8860b' },
] as const;

const SEED_KEY = 'pinstripe.m3seed';
const DEFAULT_SEED = '#1da1f2';

const opaque = (hex: string) => (/^#[0-9a-f]{8}$/i.test(hex) && hex.slice(7).toLowerCase() === 'ff' ? hex.slice(0, 7) : hex);

const dynamicColors = new MaterialDynamicColors();

function fromSeed(seed: string, dark: boolean): Record<M3Role, string> {
  // "Content": the seed itself stays in the palette (the primary container), so Bird is Twitter's blue.
  const scheme = new SchemeContent(Hct.fromInt(argbFromHex(seed)), dark, 0, '2025', 'phone');
  const out = {} as Record<M3Role, string>;
  for (const role of ROLES) {
    const color = (dynamicColors as unknown as Record<M3Role, () => { getArgb: (s: SchemeContent) => number }>)[role]?.();
    out[role] = color ? hexFromArgb(color.getArgb(scheme)) : dark ? '#000000' : '#ffffff';
  }
  out.scrim = '#000000';
  return out;
}

export function makeScheme(seed: string, dark: boolean): M3Colors {
  const wall = seed === 'wallpaper' ? wallpaperColors(dark) : null;
  const base = wall ? (Object.fromEntries(ROLES.map((r) => [r, opaque(wall[r] ?? '#000000')])) as Record<M3Role, string>) : fromSeed(seed === 'wallpaper' ? DEFAULT_SEED : seed, dark);
  return { ...base, boost: dark ? '#2fd083' : '#17bf63', like: dark ? '#ff4f8b' : '#e0245e' };
}

interface M3Context {
  c: M3Colors;
  dark: boolean;
  seed: string;
  setSeed: (seed: string) => void;
  /** Whether the wallpaper can colour the app (Android 12+). */
  wallpaperAvailable: boolean;
}

const Context = createContext<M3Context>({
  c: makeScheme(DEFAULT_SEED, false),
  dark: false,
  seed: DEFAULT_SEED,
  setSeed: () => {},
  wallpaperAvailable: false,
});

export function M3Provider({ children }: { children: ReactNode }) {
  const dark = useColorScheme() === 'dark';
  const [seed, setSeedState] = useState<string>(dynamicColorAvailable ? 'wallpaper' : DEFAULT_SEED);

  useEffect(() => {
    getJson<string>(SEED_KEY)
      .then((saved) => {
        if (saved && (saved !== 'wallpaper' || dynamicColorAvailable)) setSeedState(saved);
      })
      .catch(() => {});
  }, []);

  const setSeed = useCallback((next: string) => {
    setSeedState(next);
    setJson(SEED_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ c: makeScheme(seed, dark), dark, seed, setSeed, wallpaperAvailable: dynamicColorAvailable }),
    [seed, dark, setSeed],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useM3(): M3Context {
  return useContext(Context);
}

/** Colour with an opacity, for state layers (hover 8%, pressed 10%, and so on). */
export function alpha(hex: string, amount: number): string {
  const h = hex.slice(0, 7);
  return `${h}${Math.round(amount * 255)
    .toString(16)
    .padStart(2, '0')}`;
}

/** The M3 type scale, set in Google Sans Flex. */
const f = (fontSize: number, lineHeight: number, fontWeight: '400' | '500' | '600' | '700' | '800' = '400', letterSpacing = 0) =>
  ({ fontFamily: 'Google Sans Flex', fontSize, lineHeight, fontWeight, letterSpacing }) as const;

export const type = {
  displaySmall: f(36, 44),
  headlineLarge: f(32, 40, '500'),
  headlineMedium: f(28, 36, '500'),
  headlineSmall: f(24, 32, '500'),
  titleLarge: f(22, 28, '500'),
  titleMedium: f(16, 24, '600', 0.15),
  titleSmall: f(14, 20, '600', 0.1),
  bodyLarge: f(16, 24, '400', 0.2),
  bodyMedium: f(14, 20, '400', 0.2),
  bodySmall: f(12, 16, '400', 0.3),
  labelLarge: f(14, 20, '600', 0.1),
  labelMedium: f(12, 16, '600', 0.4),
  labelSmall: f(11, 16, '600', 0.5),
  /** Expressive emphasis: the big, heavy headline Pixel apps open with. */
  headlineEmphasized: f(30, 36, '800', -0.4),
} as const;

/** Corner radii from the M3 shape scale. */
export const shape = { xs: 4, sm: 8, md: 12, lg: 16, lgInc: 20, xl: 28, xlInc: 32, xxl: 48, full: 999 } as const;

/**
 * Springs from the M3 Expressive motion scheme, for Animated.spring:
 * spatial ones overshoot a little (things moving and resizing), effects
 * ones don't (colour and opacity).
 */
function spring(dampingRatio: number, stiffness: number) {
  return { stiffness, damping: dampingRatio * 2 * Math.sqrt(stiffness), mass: 1, useNativeDriver: true } as const;
}
export const motion = {
  fastSpatial: spring(0.6, 800),
  defaultSpatial: spring(0.8, 380),
  slowSpatial: spring(0.8, 200),
  fastEffects: spring(1, 3800),
  defaultEffects: spring(1, 1600),
} as const;

/** Runs an M3 spring on an Animated value. */
export function springTo(value: Animated.Value, toValue: number, kind: keyof typeof motion = 'defaultSpatial', useNativeDriver = true) {
  return Animated.spring(value, { ...motion[kind], toValue, useNativeDriver });
}
