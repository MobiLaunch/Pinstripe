/**
 * M3 Expressive's FAB menu: the floating action button turns into a round
 * close button and its choices spring up above it, one after another, as
 * pills in the primary container colour.
 */
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { alpha, springTo, type, useM3 } from '@/theme/m3';

import { M3Pressable } from './pressable';
import { Glyph, type SymbolName } from './symbol';

export interface FabItem {
  label: string;
  icon: SymbolName;
  onPress: () => void;
}

export function FabMenu({ icon, label, items }: { icon: SymbolName; label: string; items: FabItem[] }) {
  const { c } = useM3();
  const [open, setOpen] = useState(false);
  const [progress] = useState(() => new Animated.Value(0));
  const [items$] = useState(() => items.map(() => new Animated.Value(0)));
  useEffect(() => {
    springTo(progress, open ? 1 : 0, 'fastSpatial', false).start();
    const order = open ? [...items$].reverse() : items$;
    Animated.stagger(
      35,
      order.map((v) => springTo(v, open ? 1 : 0, open ? 'fastSpatial' : 'fastEffects')),
    ).start();
  }, [open, progress, items$]);

  const size = 56;
  return (
    <>
      {open ? <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: alpha(c.surface, 0.6) }]} onPress={() => setOpen(false)} accessibilityLabel="Close menu" /> : null}
      <View style={styles.anchor} pointerEvents="box-none">
        {open ? (
          <View style={styles.items} accessibilityRole="menu">
            {items.map((item, i) => (
              <Animated.View
                key={item.label}
                style={{
                  opacity: items$[i],
                  transform: [
                    { translateY: items$[i]!.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
                    { scale: items$[i]!.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                  ],
                }}>
                <M3Pressable
                  accessibilityRole="menuitem"
                  content={c.onPrimaryContainer}
                  onPress={() => {
                    setOpen(false);
                    item.onPress();
                  }}
                  style={[styles.item, { backgroundColor: c.primaryContainer }]}>
                  <Glyph name={item.icon} color={c.onPrimaryContainer} />
                  <Text style={[type.titleMedium, { color: c.onPrimaryContainer }]}>{item.label}</Text>
                </M3Pressable>
              </Animated.View>
            ))}
          </View>
        ) : null}
        <Animated.View
          style={[
            styles.fab,
            {
              width: size,
              height: size,
              // Squircle to circle as it opens; primary container to primary.
              borderRadius: progress.interpolate({ inputRange: [0, 1], outputRange: [16, size / 2] }),
              backgroundColor: progress.interpolate({ inputRange: [0, 1], outputRange: [c.primaryContainer, c.primary] }),
            },
          ]}>
          <M3Pressable
            accessibilityRole="button"
            accessibilityLabel={open ? 'Close menu' : label}
            accessibilityState={{ expanded: open }}
            content={open ? c.onPrimary : c.onPrimaryContainer}
            onPress={() => setOpen((o) => !o)}
            style={styles.fabPress}>
            <Animated.View style={{ transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }] }}>
              <Glyph name={open ? 'close' : icon} color={open ? c.onPrimary : c.onPrimaryContainer} />
            </Animated.View>
          </M3Pressable>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', right: 16, bottom: 16, alignItems: 'flex-end', gap: 8 },
  items: { alignItems: 'flex-end', gap: 4, marginBottom: 4 },
  item: { height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 20, paddingRight: 24 },
  fab: { overflow: 'hidden', boxShadow: '0 3px 6px rgba(0,0,0,0.18), 0 1px 2px rgba(0,0,0,0.2)' },
  fabPress: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
