/**
 * What the app knows the moment it starts, before any component renders:
 * whether the Liquid Glass look was chosen last time. Styles are created
 * when modules load, so fonts and colours that depend on it are decided here.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const THEME_KEY = 'pinstripe.theme';

/** Glass at launch (phones only: the web switches with stylesheet rules instead). */
export const startedInGlass: boolean = (() => {
  if (Platform.OS === 'web') return false;
  try {
    const saved = SecureStore.getItem(THEME_KEY);
    return !!saved && saved.includes('glass');
  } catch {
    return false;
  }
})();
