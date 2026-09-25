/**
 * The iOS 6 share sheet (UIActivityViewController): the action sheet's
 * dark glass with a grid of glossy, rounded app-style icons: Message,
 * Mail, Copy Link, Save Video, Open in Browser and More (the system's own
 * sheet), then a dark Cancel.
 */
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Linking, Modal, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetButton, SheetGlass, sheetStyles } from '@/components/action-menu';
import { flashHud } from '@/components/hud';
import { Icon, type IconName } from '@/components/icon';
import { fontFamily } from '@/theme/aqua';

interface Activity {
  label: string;
  icon: IconName;
  colors: [string, string];
  run: () => unknown;
}

export function ShareSheet({
  visible,
  url,
  text,
  onSaveVideo,
  onClose,
}: {
  visible: boolean;
  url: string;
  /** Goes before the link in messages and mail. */
  text?: string;
  onSaveVideo?: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const body = text ? `${text}\n${url}` : url;
  const encoded = encodeURIComponent(body);

  const activities: Activity[] = [
    ...(Platform.OS === 'web'
      ? []
      : [
          {
            label: 'Message',
            icon: 'bubble' as const,
            colors: ['#8ef27a', '#1fa31a'] as [string, string],
            run: () => Linking.openURL(`sms:${Platform.OS === 'ios' ? '&' : '?'}body=${encoded}`),
          },
        ]),
    { label: 'Mail', icon: 'mail', colors: ['#8fd0ff', '#1567d3'], run: () => Linking.openURL(`mailto:?body=${encoded}`) },
    {
      label: 'Copy Link',
      icon: 'copy',
      colors: ['#c9ced6', '#6d7684'],
      run: async () => {
        await Clipboard.setStringAsync(url);
        flashHud('Copied');
      },
    },
    ...(onSaveVideo ? [{ label: 'Save Video', icon: 'download' as const, colors: ['#ffc56b', '#e2780c'] as [string, string], run: onSaveVideo }] : []),
    { label: 'Open in Browser', icon: 'compass', colors: ['#9ad8ff', '#2d7fd8'], run: () => Linking.openURL(url) },
    { label: 'More', icon: 'more', colors: ['#a3a8b0', '#4d535c'], run: () => Share.share({ message: body, url }).catch(() => {}) },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sheetStyles.backdrop} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      <View style={[sheetStyles.sheet, { paddingBottom: insets.bottom + 18 }]} accessibilityViewIsModal>
        <SheetGlass />
        <View style={styles.grid}>
          {activities.map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => {
                onClose();
                Promise.resolve(a.run()).catch(() => {});
              }}
              style={styles.activity}>
              {({ pressed }) => (
                <>
                  <View style={[styles.icon, pressed && styles.pressed]}>
                    <LinearGradient colors={a.colors} style={StyleSheet.absoluteFill} />
                    <Icon name={a.icon} size={32} color="#ffffff" strokeWidth={2.2} />
                    {/* The iOS 6 gloss: a bright arc over the top half. */}
                    <LinearGradient colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.12)']} style={styles.gloss} pointerEvents="none" />
                  </View>
                  <Text style={styles.label} numberOfLines={2}>
                    {a.label}
                  </Text>
                </>
              )}
            </Pressable>
          ))}
        </View>
        <SheetButton label="Cancel" kind="cancel" onPress={onClose} style={sheetStyles.cancel} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 14, paddingTop: 6, paddingBottom: 4 },
  activity: { width: '25%', minWidth: 76, alignItems: 'center', gap: 6 },
  icon: {
    width: 57,
    height: 57,
    borderRadius: 11,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.5)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.6)',
  },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%', borderBottomLeftRadius: 60, borderBottomRightRadius: 60, transform: [{ scaleX: 1.4 }] },
  pressed: { opacity: 0.6 },
  label: {
    fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: -1 },
    textShadowRadius: 0,
  },
});
