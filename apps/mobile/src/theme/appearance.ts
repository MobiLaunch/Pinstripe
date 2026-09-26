/**
 * Light and dark colours for the Liquid Glass and Android looks, following the system's
 * appearance. Styles are made once, so each colour is one the platform
 * resolves by itself as the appearance changes:
 *
 * - iPhone: DynamicColorIOS, live.
 * - Web: a CSS variable, set for dark mode by a stylesheet rule that only
 *   applies while one of those looks is on (see web-fixes.ts).
 * - Android: chosen when the app starts.
 *
 * In the iOS 6 look (and when the app didn't start in Glass) the light
 * colour is used as is, so it never changes.
 */
import { Appearance, type ColorValue, DynamicColorIOS, Platform, useColorScheme } from 'react-native';

import { material, startedInGlass } from './startup';

const darkValues = new Map<string, string>();

export function themed(name: string, light: string, dark: string): ColorValue {
  if (Platform.OS === 'web') {
    darkValues.set(name, dark);
    return `var(--pin-${name}, ${light})`;
  }
  if (!startedInGlass && !material) return light;
  if (Platform.OS === 'ios') return DynamicColorIOS({ light, dark });
  return Appearance.getColorScheme() === 'dark' ? dark : light;
}

/** The web's dark-mode values, as one CSS rule. */
export function darkModeCss(): string {
  const vars = [...darkValues].map(([name, value]) => `--pin-${name}: ${value};`).join(' ');
  return `@media (prefers-color-scheme: dark) { html.glass-font, html.material { ${vars} } }`;
}

/** Whether the system is dark right now (for colours that must be plain strings, like icons). */
export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}
