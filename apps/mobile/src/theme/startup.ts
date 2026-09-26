/**
 * What the app knows the moment it starts, before any component renders:
 * whether it wears the Android look, and whether the Liquid Glass look was
 * chosen last time. Styles are created
 * when modules load, so fonts and colours that depend on it are decided here.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const THEME_KEY = 'pinstripe.theme';

const ANDROID_PREVIEW_KEY = 'pinstripe.android';

/**
 * The Android look (Material 3 Expressive): always on Android, never on
 * iPhone. The web can preview it: open the app with `?android=1` (it's
 * remembered) and `?android=0` to go back.
 */
export const material: boolean = (() => {
  if (Platform.OS === 'android') return true;
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  try {
    const asked = new URLSearchParams(window.location.search).get('android');
    if (asked !== null) window.localStorage.setItem(ANDROID_PREVIEW_KEY, asked === '0' ? '0' : '1');
    return window.localStorage.getItem(ANDROID_PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
})();

/** Glass at launch (phones only: the web switches with stylesheet rules instead). */
export const startedInGlass: boolean = (() => {
  if (Platform.OS === 'web' || material) return false;
  try {
    const saved = SecureStore.getItem(THEME_KEY);
    return !!saved && saved.includes('glass');
  } catch {
    return false;
  }
})();
