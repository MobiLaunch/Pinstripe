/**
 * The colour choice in Settings, as a Pixel's "Wallpaper & style" shows it:
 * a row of round swatches, each split into its palette's colours, the
 * chosen one ringed with a tick. "Wallpaper" appears where Android can
 * colour the app from it (Android 12+).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { makeScheme, SEEDS, type, useM3 } from '@/theme/m3';

import { Glyph } from './symbol';

export function ColourPicker() {
  const { c, dark, seed, setSeed, wallpaperAvailable } = useM3();
  const options = SEEDS.filter((s) => s.value !== 'wallpaper' || wallpaperAvailable);
  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {options.map((o) => {
        const on = seed === o.value;
        const scheme = makeScheme(o.value, dark);
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={o.label}
            onPress={() => setSeed(o.value)}
            style={styles.option}>
            <View style={[styles.ring, { borderColor: on ? c.primary : 'transparent' }]}>
              <View style={styles.swatch}>
                <View style={[styles.top, { backgroundColor: scheme.primary }]} />
                <View style={styles.bottom}>
                  <View style={[styles.half, { backgroundColor: scheme.secondaryContainer }]} />
                  <View style={[styles.half, { backgroundColor: scheme.tertiaryContainer }]} />
                </View>
                {o.value === 'wallpaper' || on ? (
                  <View style={styles.centre}>
                    <View style={[styles.badge, { backgroundColor: scheme.primaryContainer }]}>
                      <Glyph name={on ? 'check' : 'wallpaper'} size={18} color={scheme.onPrimaryContainer} />
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
            <Text style={[type.labelMedium, { color: on ? c.onSurface : c.onSurfaceVariant }]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingVertical: 12, rowGap: 12 },
  option: { width: '25%', alignItems: 'center', gap: 6 },
  ring: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, padding: 3 },
  swatch: { flex: 1, borderRadius: 999, overflow: 'hidden' },
  top: { flex: 1 },
  bottom: { flex: 1, flexDirection: 'row' },
  half: { flex: 1 },
  centre: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  badge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
