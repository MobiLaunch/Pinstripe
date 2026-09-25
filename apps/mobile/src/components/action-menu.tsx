import { LinearGradient } from 'expo-linear-gradient';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamily } from '@/theme/aqua';

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
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" accessibilityRole="button" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 18 }]} accessibilityViewIsModal>
        <LinearGradient colors={['rgba(64,72,86,0.92)', 'rgba(22,28,38,0.94)']} style={StyleSheet.absoluteFill} pointerEvents="none" />
        <View style={styles.sheetShine} pointerEvents="none" />
        {title ? (
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
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
        <SheetButton label="Cancel" kind="cancel" onPress={onClose} style={styles.cancel} />
      </View>
    </Modal>
  );
}

const FACES = {
  default: { colors: ['#ffffff', '#f3f3f3', '#e4e4e4', '#dadada'], text: '#141922', shadow: '#ffffff', shadowY: 1 },
  destructive: { colors: ['#f19a93', '#df4a3f', '#c7271c', '#b31b11'], text: '#ffffff', shadow: 'rgba(0,0,0,0.45)', shadowY: -1 },
  cancel: { colors: ['#737373', '#454545', '#2c2c2c', '#232323'], text: '#ffffff', shadow: 'rgba(0,0,0,0.6)', shadowY: -1 },
} as const;

function SheetButton({ label, kind, onPress, style }: { label: string; kind: keyof typeof FACES; onPress: () => void; style?: object }) {
  const face = FACES[kind];
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
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 16,
    paddingHorizontal: 20,
    gap: 10,
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: '#0b0f15',
  },
  sheetShine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' },
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
  cancel: { marginTop: 8 },
});
