import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassSurface, glassFont, glassText } from '@/components/liquid';
import { fontFamily } from '@/theme/aqua';
import { useGlass } from '@/theme/theme';

export interface MenuAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

/**
 * The iOS 6 action sheet: dark glass sliding up from the bottom, with white
 * glossy buttons, a red one for destructive choices, and a dark Cancel.
 */
export function ActionMenu({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: MenuAction[];
  onClose: () => void;
}) {
  const frame = useSheetFrame();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose} accessibilityLabel="Close menu" accessibilityRole="button" />
      <View style={frame} accessibilityViewIsModal>
        <SheetGlass />
        {title ? <SheetTitle title={title} /> : null}
        {actions.map((a) => (
          <SheetButton
            key={a.label}
            label={a.label}
            kind={a.destructive ? 'destructive' : 'default'}
            onPress={() => {
              onClose();
              a.onPress();
            }}
          />
        ))}
        <SheetButton label="Cancel" kind="cancel" onPress={onClose} style={sheetStyles.cancel} />
      </View>
    </Modal>
  );
}

/**
 * Where a sheet sits: across the bottom edge in iOS 6, a rounded glass card
 * floating just above it in Liquid Glass.
 */
export function useSheetFrame(): StyleProp<ViewStyle> {
  const insets = useSafeAreaInsets();
  const glass = useGlass();
  return glass
    ? [sheetStyles.sheet, glassStyles.frame, { bottom: Math.max(insets.bottom, 8), paddingBottom: 16 }]
    : [sheetStyles.sheet, { paddingBottom: insets.bottom + 18 }];
}

export function SheetTitle({ title }: { title: string }) {
  const glass = useGlass();
  return (
    <Text style={[sheetStyles.title, glass && glassStyles.title]} accessibilityRole="header">
      {title}
    </Text>
  );
}

/** The sheet's dark glass and its top highlight (or Liquid Glass). */
export function SheetGlass() {
  if (useGlass()) return <GlassSurface radius={34} style={StyleSheet.absoluteFill} />;
  return (
    <>
      <LinearGradient colors={['rgba(64,72,86,0.92)', 'rgba(22,28,38,0.94)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={styles.sheetShine} pointerEvents="none" />
    </>
  );
}

export const sheetStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    // On a wide browser window, as wide as the app's column.
    width: '100%',
    maxWidth: 440,
    marginHorizontal: 'auto',
    paddingTop: 16,
    paddingHorizontal: 20,
    gap: 10,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: '#0b0f15',
  },
  title: {
    fontFamily,
    fontSize: 14,
    color: '#d6dbe3',
    textAlign: 'center',
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: -1 },
    textShadowRadius: 0,
  },
  cancel: { marginTop: 8 },
});

const FACES = {
  default: { colors: ['#ffffff', '#f3f3f3', '#e4e4e4', '#dadada'], text: '#141922', shadow: '#ffffff', shadowY: 1 },
  destructive: { colors: ['#f19a93', '#df4a3f', '#c7271c', '#b31b11'], text: '#ffffff', shadow: 'rgba(0,0,0,0.45)', shadowY: -1 },
  cancel: { colors: ['#737373', '#454545', '#2c2c2c', '#232323'], text: '#ffffff', shadow: 'rgba(0,0,0,0.6)', shadowY: -1 },
} as const;

/** A button on the dark glass sheet: white, red (destructive) or the dark Cancel. */
export function SheetButton({ label, kind, onPress, style }: { label: string; kind: keyof typeof FACES; onPress: () => void; style?: object }) {
  const face = FACES[kind];
  if (useGlass()) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [glassStyles.button, kind === 'cancel' && glassStyles.cancel, pressed && glassStyles.pressed, style]}>
        <Text style={[glassStyles.label, kind === 'destructive' && glassStyles.destructive, kind === 'cancel' && glassStyles.cancelLabel]}>{label}</Text>
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.pressed, style]}>
      <LinearGradient colors={face.colors} locations={[0, 0.5, 0.5, 1]} style={[StyleSheet.absoluteFill, styles.face]} />
      <Text
        style={[
          styles.label,
          { color: face.text, textShadowColor: face.shadow, textShadowOffset: { width: 0, height: face.shadowY }, textShadowRadius: 0 },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheetShine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
  button: {
    height: 46,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#10151d',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    boxShadow: '0 1px 0 rgba(255,255,255,0.18)',
  },
  pressed: { opacity: 0.75 },
  face: { borderRadius: 8 },
  label: { fontFamily, fontSize: 19, fontWeight: '700' },
});

const glassStyles = StyleSheet.create({
  frame: { left: 8, right: 8, width: 'auto', borderRadius: 34, borderTopWidth: 0, paddingHorizontal: 16, paddingTop: 18, overflow: 'visible' },
  title: { color: glassText.secondary, textShadowColor: 'transparent', fontFamily: glassFont, fontSize: 13 },
  button: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(120,120,128,0.14)' },
  cancel: { marginTop: 6, backgroundColor: 'rgba(120,120,128,0.24)' },
  pressed: { transform: [{ scale: 0.97 }], opacity: 0.8 },
  label: { fontFamily: glassFont, fontSize: 17, fontWeight: '600', color: glassText.primary },
  destructive: { color: glassText.red },
  cancelLabel: { fontWeight: '700' },
});
