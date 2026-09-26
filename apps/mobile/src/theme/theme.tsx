/**
 * Blue or Graphite, as in Mac OS X: only the accent changes (gel buttons,
 * active orbs, the selected segment, avatars, the banner, progress bars).
 * Pinstripes and brushed metal stay as they are. The choice is kept on the
 * device so it applies before the server answers, and follows the account
 * setting when it does.
 */
import type { Theme } from '@pinstripe/core';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import { useAuth } from '@/auth/session';
import { getJson, setJson } from '@/auth/storage';
import { setSystemFontOnWeb } from '@/web-fixes';

import { colors, type Gradient, gradients, THEME_KEY } from './aqua';

export interface Accent {
  theme: Theme;
  /** Solid accent: focus rings, switches, checkboxes, selected tabs. */
  color: string;
  colorActive: string;
  gel: Gradient;
  gelBorder: string;
  segmentOn: Gradient;
  orbActive: Gradient;
  orbActiveBorder: string;
  avatar: Gradient;
  banner: Gradient;
  bannerEdge: string;
  /** The light stripe of the barber-pole progress bar. */
  stripe: string;
  // iOS 6 chrome
  /** Navigation bars and toolbars (UIBarStyleDefault for Blue, UIBarStyleBlack for Graphite). */
  navBar: Gradient;
  navBarEdge: string;
  /** Bordered bar buttons, and bar-style segmented controls. */
  barButton: Gradient;
  barButtonPressed: Gradient;
  barButtonBorder: string;
  /** UISwitch when on. */
  switchOn: Gradient;
  switchOnBorder: string;
  /** A pressed table row. */
  selection: Gradient;
  /** UISearchBar's backdrop. */
  searchBar: Gradient;
  /** The selected tab's icon in the black tab bar. */
  tabIcon: string;
}

let glassAccent: Accent | undefined;

export const ACCENTS: Record<Theme, Accent> = {
  blue: {
    theme: 'blue',
    color: colors.accent,
    colorActive: colors.accentActive,
    gel: gradients.gelBlue,
    gelBorder: '#13488f',
    segmentOn: gradients.segmentOn,
    orbActive: gradients.orbBlue,
    orbActiveBorder: '#0a3a80',
    avatar: gradients.avatar,
    banner: gradients.banner,
    bannerEdge: '#0e3f86',
    stripe: '#8ac3ff',
    navBar: { colors: ['#c3cedb', '#a3b3c7', '#889cb6', '#7a8fab', '#6d83a1'], locations: [0, 0.48, 0.5, 0.75, 1] },
    navBarEdge: '#2d3642',
    barButton: { colors: ['#9aabc1', '#7489a6', '#5d7495', '#58708f'], locations: [0, 0.49, 0.5, 1] },
    barButtonPressed: { colors: ['#6f84a2', '#556b8b', '#47607f', '#415a79'], locations: [0, 0.49, 0.5, 1] },
    barButtonBorder: '#3b4d68',
    switchOn: { colors: ['#0a5fd6', '#2079ec', '#3c93f5'], locations: [0, 0.5, 1] },
    switchOnBorder: '#1c4f99',
    selection: { colors: ['#058cf5', '#015fe6'] },
    searchBar: { colors: ['#d3dbe4', '#b7c2d0', '#a7b4c4'], locations: [0, 0.5, 1] },
    tabIcon: '#3fb0ff',
  },
  graphite: {
    theme: 'graphite',
    color: '#6b7a8c',
    colorActive: '#4d5a6a',
    gel: {
      colors: ['#e8edf2', '#bcc6d1', '#8392a3', '#6b7a8c', '#8a99aa', '#c6cfd9'],
      locations: [0, 0.14, 0.5, 0.51, 0.85, 1],
    },
    gelBorder: '#4a5563',
    segmentOn: { colors: ['#d3dae2', '#8e9cad', '#6b7a8c', '#95a3b3'], locations: [0, 0.5, 0.51, 1] },
    orbActive: { colors: ['#9aa7b6', '#46525f'] },
    orbActiveBorder: '#39434f',
    avatar: { colors: ['#b8c3cf', '#5d6b7c'] },
    banner: { colors: ['#d4dbe3', '#94a2b2', '#627083'], locations: [0, 0.6, 1] },
    bannerEdge: '#4a5563',
    stripe: '#c4ccd6',
    navBar: { colors: ['#5c5c5c', '#3a3a3a', '#252525', '#181818', '#0e0e0e'], locations: [0, 0.48, 0.5, 0.75, 1] },
    navBarEdge: '#000000',
    barButton: { colors: ['#555555', '#353535', '#242424', '#1c1c1c'], locations: [0, 0.49, 0.5, 1] },
    barButtonPressed: { colors: ['#202020', '#121212', '#050505', '#000000'], locations: [0, 0.49, 0.5, 1] },
    barButtonBorder: '#000000',
    switchOn: { colors: ['#4d5a6a', '#6b7a8c', '#8392a3'], locations: [0, 0.5, 1] },
    switchOnBorder: '#39434f',
    selection: { colors: ['#9aa6b5', '#5d6b7c'] },
    searchBar: { colors: ['#b9b9b9', '#9a9a9a', '#8a8a8a'], locations: [0, 0.5, 1] },
    tabIcon: '#e8eef5',
  },
  // Liquid Glass: the system blue on glass; the iOS 6 fields below are unused there.
  get glass(): Accent {
    return (glassAccent ??= {
      ...ACCENTS.blue,
      theme: 'glass',
      color: '#0a84ff',
      colorActive: '#0060df',
      gel: { colors: ['#0a84ff', '#0a84ff'] },
      gelBorder: 'transparent',
      segmentOn: { colors: ['#ffffff', '#ffffff'] },
      orbActive: { colors: ['#2f95ff', '#0a6be0'] },
      orbActiveBorder: 'rgba(255,255,255,0.5)',
      avatar: { colors: ['#6fb4ff', '#2c6fe0'] },
      switchOn: { colors: ['#34c759', '#34c759'] },
      switchOnBorder: '#34c759',
      selection: { colors: ['#d1d1d6', '#d1d1d6'] },
      tabIcon: '#0a84ff',
    });
  },
};

const ThemeContext = createContext<{ accent: Accent; setTheme: (theme: Theme) => void }>({ accent: ACCENTS.blue, setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const [theme, setThemeState] = useState<Theme>('blue');

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setJson(THEME_KEY, next).catch(() => {});
  }, []);

  useEffect(() => {
    getJson<Theme>(THEME_KEY)
      .then((saved) => saved && ACCENTS[saved] && setThemeState(saved))
      .catch(() => {});
  }, []);

  // Follow the account's setting (Pinstripe servers only).
  const client = state.status === 'signedIn' ? state.client : null;
  useEffect(() => {
    client
      ?.preferences()
      .then((p) => ACCENTS[p.theme] && setTheme(p.theme))
      .catch(() => {});
  }, [client, setTheme]);

  useEffect(() => setSystemFontOnWeb(theme === 'glass'), [theme]);

  const value = useMemo(() => ({ accent: ACCENTS[theme], setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAccent(): Accent {
  return useContext(ThemeContext).accent;
}

/** True for the Liquid Glass look, where components draw glass instead of iOS 6 chrome. */
export function useGlass(): boolean {
  return useContext(ThemeContext).accent.theme === 'glass';
}

/**
 * Plain text colours for the current look and appearance, for things that
 * can't take a system-resolved colour (icons drawn as SVG).
 */
export function useInk(): { text: string; muted: string; subtle: string } {
  const glass = useGlass();
  const scheme = useColorScheme();
  const dark = glass && scheme === 'dark';
  return dark
    ? { text: '#ffffff', muted: 'rgba(235,235,245,0.6)', subtle: 'rgba(235,235,245,0.7)' }
    : { text: '#1a1a1a', muted: '#555555', subtle: '#444444' };
}

export function useSetTheme(): (theme: Theme) => void {
  return useContext(ThemeContext).setTheme;
}
