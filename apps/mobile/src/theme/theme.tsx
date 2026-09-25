/**
 * Blue or Graphite, as in Mac OS X: only the accent changes (gel buttons,
 * active orbs, the selected segment, avatars, the banner, progress bars).
 * Pinstripes and brushed metal stay as they are. The choice is kept on the
 * device so it applies before the server answers, and follows the account
 * setting when it does.
 */
import type { Theme } from '@pinstripe/core';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/auth/session';
import { getJson, setJson } from '@/auth/storage';

import { colors, type Gradient, gradients } from './aqua';

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
}

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
  },
};

const THEME_KEY = 'pinstripe.theme';
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

  const value = useMemo(() => ({ accent: ACCENTS[theme], setTheme }), [theme, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAccent(): Accent {
  return useContext(ThemeContext).accent;
}

export function useSetTheme(): (theme: Theme) => void {
  return useContext(ThemeContext).setTheme;
}
