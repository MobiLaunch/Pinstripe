/** Material You on Android 12 and later: the colours Android takes from the wallpaper. */
import { getMaterialColors, isDynamicColorAvailable } from '@expo/ui/jetpack-compose';

export const dynamicColorAvailable = isDynamicColorAvailable;

export function wallpaperColors(dark: boolean): Record<string, string> | null {
  if (!isDynamicColorAvailable) return null;
  try {
    return getMaterialColors({ scheme: dark ? 'dark' : 'light' });
  } catch {
    return null;
  }
}
