/**
 * Aqua design tokens, lifted from the "Fediverse Video App – Aqua Screens"
 * canvas. Gradients are [colors, locations] pairs for expo-linear-gradient.
 */
import { Platform } from 'react-native';

import { themed } from './appearance';
import { startedInGlass } from './startup';

type Stops = readonly [string, string, ...string[]];
type Locations = readonly [number, number, ...number[]];
export interface Gradient {
  colors: Stops;
  locations?: Locations;
}

// Text and surfaces take dark values in Liquid Glass's dark mode (see appearance.ts).
export const colors = {
  text: themed('text', '#1a1a1a', '#ffffff'),
  textMuted: themed('text-muted', '#555555', 'rgba(235,235,245,0.6)'),
  textSubtle: themed('text-subtle', '#444444', 'rgba(235,235,245,0.7)'),
  link: themed('link', '#1558b8', '#4da3ff'),
  accent: '#2a74d6',
  accentDeep: '#175cbe',
  accentActive: '#0e4fae',
  verified: '#1b6a24',
  danger: '#b31f14',
  border: '#adadad',
  borderStrong: '#6f6f6f',
  hairline: themed('hairline', '#d2d2d2', '#38383a'),
  card: themed('card', '#ffffff', '#1c1c1e'),
  groupFill: themed('group-fill', 'rgba(255,255,255,0.78)', '#1c1c1e'),
  pinstripeLight: '#f4f4f4',
  pinstripeDark: '#e3e3e3',
  videoBackdrop: '#07121f',
  onVideo: '#ffffff',
  onVideoMuted: '#d4e4f7',
} as const;

export const gradients = {
  /** Brushed-metal bars: headers and the tab bar. */
  metal: { colors: ['#f7f7f7', '#dedede', '#cbcbcb', '#bababa'], locations: [0, 0.48, 0.52, 1] },
  /** Primary gel ("lickable") button. */
  gelBlue: {
    colors: ['#bfe0ff', '#74b1f3', '#2a74d6', '#175cbe', '#3585e6', '#79c0ff'],
    locations: [0, 0.14, 0.5, 0.51, 0.85, 1],
  },
  gelGray: {
    colors: ['#ffffff', '#f1f1f1', '#d9d9d9', '#e8e8e8', '#fbfbfb'],
    locations: [0, 0.48, 0.52, 0.85, 1],
  },
  gelRed: {
    colors: ['#ffc9c2', '#f0786c', '#cf2f22', '#b31f14', '#d8433a', '#ff8a7e'],
    locations: [0, 0.14, 0.5, 0.51, 0.85, 1],
  },
  /** Specular highlight laid over the top half of gel controls. */
  gloss: { colors: ['rgba(255,255,255,0.9)', 'rgba(255,255,255,0.12)'] },
  segment: { colors: ['#ffffff', '#f0f0f0', '#d8d8d8', '#efefef'], locations: [0, 0.48, 0.52, 1] },
  segmentOn: { colors: ['#9fcdff', '#3a88e8', '#175cbe', '#4a9af2'], locations: [0, 0.5, 0.51, 1] },
  orb: { colors: ['#6d6d6d', '#1c1c1c'] },
  orbBlue: { colors: ['#4a9cf5', '#0c47a2'] },
  avatar: { colors: ['#7cc0ff', '#1d5fc0'] },
  banner: { colors: ['#9ad5ff', '#3f8fe6', '#1d5bbb'], locations: [0, 0.6, 1] },
  videoScrim: { colors: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.72)'] },
} satisfies Record<string, Gradient>;

export const gelBorders = { blue: '#13488f', gray: '#777777', red: '#86190f' } as const;

export const radii = { field: 5, segment: 7, card: 9, pill: 999 } as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export { THEME_KEY } from './startup';

/**
 * Lucida Grande is the Aqua system face (Geneva/Verdana its web fallbacks),
 * and iOS 6 used Helvetica Neue. Liquid Glass uses the system font, from
 * the next launch after it's chosen (on the web it switches at once).
 */
export const fontFamily = startedInGlass
  ? Platform.select({ ios: undefined, android: undefined, default: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif' })
  : Platform.select({
      ios: 'Helvetica Neue',
      android: 'sans-serif',
      default: '"Lucida Grande","Lucida Sans Unicode","Lucida Sans",Geneva,Verdana,sans-serif',
    });

export const type = {
  title: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20 },
  label: { fontSize: 12, fontWeight: '700' },
  caption: { fontSize: 12 },
} as const;

/** Minimum hit target, per the design's accessibility notes. */
export const touchTarget = 44;
