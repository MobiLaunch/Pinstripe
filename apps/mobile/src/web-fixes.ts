/**
 * Browser quirks react-native-web leaves to the app.
 *
 * When a focused control sits inside a container with `overflow: hidden`
 * (the Feed ← Videos → Account pager is one), browsers scroll that container
 * to keep the control in view, say when a sheet opens over it. Such
 * containers are never meant to scroll, so the page ends up shifted
 * sideways. Undo any scroll of an overflow-hidden element.
 */
import { Asset } from 'expo-asset';
import { Platform } from 'react-native';

import { darkModeCss } from '@/theme/appearance';

if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener(
    'scroll',
    (event) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || (el.scrollLeft === 0 && el.scrollTop === 0)) return;
      const style = getComputedStyle(el);
      if (style.overflowX === 'hidden' && el.scrollLeft !== 0) el.scrollLeft = 0;
      if (style.overflowY === 'hidden' && el.scrollTop !== 0) el.scrollTop = 0;
    },
    true,
  );
}

/**
 * The Liquid Glass look uses the system font. Styles are fixed when the app
 * loads, so on the web the switch is one stylesheet rule on the page.
 */
export function setSystemFontOnWeb(on: boolean) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  let style = document.getElementById('glass-font') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'glass-font';
    // The font, and Liquid Glass's dark-mode colours (theme/appearance.ts).
    style.textContent =
      'html.glass-font, html.glass-font * { font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important; letter-spacing: -0.01em; } ' +
      darkModeCss();
    document.head.appendChild(style);
  }
  document.documentElement.classList.toggle('glass-font', on);
}

const GOOGLE_SANS_FLEX = [
  [400, require('../assets/fonts/GoogleSansFlex_400Regular.ttf')],
  [500, require('../assets/fonts/GoogleSansFlex_500Medium.ttf')],
  [600, require('../assets/fonts/GoogleSansFlex_600SemiBold.ttf')],
  [700, require('../assets/fonts/GoogleSansFlex_700Bold.ttf')],
  [800, require('../assets/fonts/GoogleSansFlex_800ExtraBold.ttf')],
] as const;

/**
 * The Android look previewed on the web: Google Sans Flex in every weight
 * (Android gets it from the build, see app.json), and the dark-mode colours.
 */
export function applyMaterialOnWeb() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById('material-look')) return;
  const style = document.createElement('style');
  style.id = 'material-look';
  style.textContent =
    GOOGLE_SANS_FLEX.map(
      ([weight, file]) =>
        `@font-face { font-family: "Google Sans Flex"; font-weight: ${weight}; font-display: swap; src: url(${Asset.fromModule(file).uri}) format("truetype"); }`,
    ).join(' ') +
    ' html.material { -webkit-font-smoothing: antialiased; } ' +
    darkModeCss();
  document.head.appendChild(style);
  document.documentElement.classList.add('material');
}
