/** Wallpaper colours exist only on Android (see m3-dynamic.android.ts); elsewhere the palette comes from a seed. */
export const dynamicColorAvailable = false;

export function wallpaperColors(_dark: boolean): Record<string, string> | null {
  return null;
}
