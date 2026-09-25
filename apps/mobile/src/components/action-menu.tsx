import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { aquaText, GelButton } from '@/components/aqua';

export interface MenuAction {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

/**
 * A sheet of choices from the bottom of the screen. Used instead of an
 * Alert with several buttons, which has no buttons on web.
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" accessibilityRole="button" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} accessibilityViewIsModal>
        {title ? (
          <Text style={[aquaText.handle, styles.title]} accessibilityRole="header">
            {title}
          </Text>
        ) : null}
        {actions.map((a) => (
          <GelButton
            key={a.label}
            title={a.label}
            tone={a.destructive ? 'red' : 'gray'}
            onPress={() => {
              onClose();
              a.onPress();
            }}
          />
        ))}
        <GelButton title="Cancel" tone="blue" onPress={onClose} style={styles.cancel} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    gap: 10,
    backgroundColor: '#ececec',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderTopWidth: 1,
    borderColor: '#9a9a9a',
  },
  title: { textAlign: 'center', marginBottom: 2 },
  cancel: { marginTop: 6 },
});
