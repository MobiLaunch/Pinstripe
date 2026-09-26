/**
 * The iOS 6 picker wheel (UIPickerView) in a sheet from the bottom: a bar
 * with a title and Done, then a white cylinder in a dark metal frame,
 * shaded top and bottom as if it curved away, with the blue glass bar
 * marking the choice. Spin it and it settles on a row; tapping a row picks
 * it too.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarButton, Toolbar } from '@/components/ios6';
import { detent } from '@/sound/sounds';
import { GlassSurface, glassFont, glassText } from '@/components/liquid';
import { M3RadioSheet } from '@/components/m3/overlays';
import { fontFamily } from '@/theme/aqua';
import { material } from '@/theme/startup';
import { useGlass } from '@/theme/theme';

const ROW = 44;
const VISIBLE = 5;

export function PickerSheet<T extends string>(props: Parameters<typeof Ios6PickerSheet<T>>[0]) {
  // Android has no wheel: a sheet of radio choices.
  return material ? <M3RadioSheet {...props} /> : <Ios6PickerSheet {...props} />;
}

function Ios6PickerSheet<T extends string>({
  visible,
  title,
  options,
  value,
  onChange,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const glass = useGlass();
  if (glass) {
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={[styles.sheet, styles.glassSheet, { bottom: Math.max(insets.bottom, 8) }]} accessibilityViewIsModal>
          <GlassSurface radius={34} style={StyleSheet.absoluteFill} />
          <View style={styles.glassHeader}>
            <Text style={styles.glassTitle} accessibilityRole="header">
              {title}
            </Text>
            <BarButton done title="Done" onPress={onClose} />
          </View>
          <Wheel options={options} value={value} onChange={onChange} glass />
        </View>
      </Modal>
    );
  }
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      <View style={styles.sheet} accessibilityViewIsModal>
        <Toolbar style={styles.bar}>
          <Text style={styles.barTitle} accessibilityRole="header">
            {title}
          </Text>
          <BarButton done title="Done" onPress={onClose} />
        </Toolbar>
        <View style={[styles.frame, { paddingBottom: insets.bottom + 10 }]}>
          <LinearGradient colors={['#8d9097', '#50535a', '#2b2d31']} locations={[0, 0.2, 1]} style={StyleSheet.absoluteFill} />
          <Wheel options={options} value={value} onChange={onChange} />
        </View>
      </View>
    </Modal>
  );
}

function Wheel<T extends string>({
  options,
  value,
  onChange,
  glass = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  glass?: boolean;
}) {
  const scroller = useRef<ScrollView>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const passing = useRef(-1);
  const [scrollY] = useState(() => new Animated.Value(0));
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  useEffect(() => () => clearTimeout(settle.current), []);
  // Start on the current choice (only when the wheel opens).
  useEffect(() => {
    passing.current = index;
    scroller.current?.scrollTo({ y: index * ROW, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = (i: number) => {
    const clamped = Math.max(0, Math.min(options.length - 1, i));
    scroller.current?.scrollTo({ y: clamped * ROW, animated: true });
    if (options[clamped]!.value !== value) onChange(options[clamped]!.value);
  };

  // Snaps to the nearest row once the spinning stops (web has no momentum events, so wait for quiet).
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    scrollY.setValue(y);
    // Click as each row crosses the glass bar, like the real wheel.
    const row = Math.max(0, Math.min(options.length - 1, Math.round(y / ROW)));
    if (row !== passing.current) {
      passing.current = row;
      detent();
    }
    clearTimeout(settle.current);
    settle.current = setTimeout(() => pick(Math.round(y / ROW)), 140);
  };

  return (
    <View style={[styles.wheel, glass && styles.wheelGlass]}>
      <Animated.ScrollView
        ref={scroller}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.wheelContent}
        onScroll={onScroll}
        scrollEventThrottle={16}
        decelerationRate="fast">
        {options.map((o, i) => {
          const selected = i === index;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={o.label}
              onPress={() => pick(i)}
              style={styles.row}>
              {/* Rows turn away on the drum the further they are from the glass. */}
              <Animated.Text
                style={[
                  styles.rowText,
                  selected && styles.rowSelected,
                  glass && styles.rowTextGlass,
                  {
                    transform: [
                      { perspective: 500 },
                      {
                        rotateX: scrollY.interpolate({
                          inputRange: [(i - 3) * ROW, i * ROW, (i + 3) * ROW],
                          outputRange: ['-65deg', '0deg', '65deg'],
                          extrapolate: 'clamp',
                        }),
                      },
                      {
                        scaleY: scrollY.interpolate({
                          inputRange: [(i - 3) * ROW, i * ROW, (i + 3) * ROW],
                          outputRange: [0.8, 1, 0.8],
                          extrapolate: 'clamp',
                        }),
                      },
                    ],
                  },
                ]}
                numberOfLines={1}>
                {o.label}
              </Animated.Text>
            </Pressable>
          );
        })}
      </Animated.ScrollView>
      {/* The cylinder's curve: rows darken as they turn away. */}
      {glass ? null : (
        <>
          <LinearGradient colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0)']} style={[styles.shade, styles.shadeTop]} pointerEvents="none" />
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.55)']} style={[styles.shade, styles.shadeBottom]} pointerEvents="none" />
        </>
      )}
      {/* The glass selection bar. */}
      {glass ? (
        <View style={styles.selectionGlass} pointerEvents="none" />
      ) : (
        <View style={styles.selection} pointerEvents="none">
          <LinearGradient colors={['rgba(222,228,247,0.55)', 'rgba(170,184,224,0.45)', 'rgba(140,157,207,0.5)', 'rgba(160,176,220,0.45)']} locations={[0, 0.49, 0.5, 1]} style={StyleSheet.absoluteFill} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, width: '100%', maxWidth: 440, marginHorizontal: 'auto' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 8 },
  barTitle: {
    fontFamily,
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 6,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: -1 },
    textShadowRadius: 0,
  },
  frame: { paddingTop: 10, paddingHorizontal: 12, overflow: 'hidden' },
  wheel: {
    height: ROW * VISIBLE,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1c1d20',
    boxShadow: 'inset 0 0 6px rgba(0,0,0,0.6)',
  },
  wheelContent: { paddingVertical: ROW * Math.floor(VISIBLE / 2) },
  row: { height: ROW, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  rowText: { fontFamily, fontSize: 22, fontWeight: '700', color: '#222222' },
  rowSelected: { color: '#000000' },
  glassSheet: { left: 8, right: 8, width: 'auto', borderRadius: 34, paddingBottom: 12 },
  glassHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4 },
  glassTitle: { fontFamily: glassFont, fontSize: 17, fontWeight: '600', color: glassText.primary },
  wheelGlass: { backgroundColor: 'transparent', borderWidth: 0, boxShadow: 'none', marginHorizontal: 8 },
  rowTextGlass: { fontFamily: glassFont, fontWeight: '400', color: glassText.primary },
  selectionGlass: {
    position: 'absolute',
    left: 4,
    right: 4,
    top: ROW * Math.floor(VISIBLE / 2),
    height: ROW,
    borderRadius: 12,
    backgroundColor: 'rgba(120,120,128,0.14)',
  },
  shade: { position: 'absolute', left: 0, right: 0, height: ROW * 2 },
  shadeTop: { top: 0 },
  shadeBottom: { bottom: 0 },
  selection: {
    position: 'absolute',
    left: -1,
    right: -1,
    top: ROW * Math.floor(VISIBLE / 2) - 2,
    height: ROW + 4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(70,80,110,0.8)',
    boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
    overflow: 'hidden',
  },
});
