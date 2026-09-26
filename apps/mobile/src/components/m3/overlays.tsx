/**
 * Material 3 overlays for the Android look: the basic dialog, the modal
 * bottom sheet (with its drag handle), a sheet of actions, the Android
 * share sheet's row of round targets, and a sheet of radio choices.
 */
import { type ReactNode, useEffect, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useReduceMotion } from '@/components/glass-motion';
import { alpha, springTo, type, useM3 } from '@/theme/m3';

import { M3Pressable } from './pressable';
import { Glyph, type SymbolName } from './symbol';

export interface M3DialogButton {
  label: string;
  style?: 'cancel' | 'default' | 'destructive';
}

/** The basic dialog: headline, supporting text, text buttons on the right. It springs in from a little smaller. */
export function M3Dialog({ title, message, buttons, onAnswer }: { title: string; message?: string; buttons: M3DialogButton[]; onAnswer: (index: number) => void }) {
  const { c } = useM3();
  const reduce = useReduceMotion();
  const [enter] = useState(() => new Animated.Value(reduce ? 1 : 0));
  useEffect(() => {
    springTo(enter, 1, 'defaultSpatial').start();
  }, [enter]);
  const stacked = buttons.length > 2 || buttons.some((b) => b.label.length > 14);
  return (
    <View style={styles.dialogBackdrop}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(c.scrim, 0.32), opacity: enter }]} />
      <Animated.View
        accessibilityViewIsModal
        accessibilityRole="alert"
        style={[
          styles.dialog,
          { backgroundColor: c.surfaceContainerHigh, opacity: enter, transform: [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }] },
        ]}>
        <Text style={[type.headlineSmall, { color: c.onSurface }]}>{title}</Text>
        {message ? <Text style={[type.bodyMedium, { color: c.onSurfaceVariant }]}>{message}</Text> : null}
        <View style={[styles.dialogButtons, stacked && styles.dialogButtonsStacked]}>
          {buttons.map((b, i) => {
            const color = b.style === 'destructive' ? c.error : c.primary;
            return (
              <M3Pressable key={b.label} accessibilityRole="button" content={color} onPress={() => onAnswer(i)} style={styles.dialogButton}>
                <Text style={[type.labelLarge, { color }]}>{b.label}</Text>
              </M3Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
}

/** The modal bottom sheet: a scrim, then a sheet with rounded top corners and a drag handle. */
export function M3Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const { c } = useM3();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={[styles.sheetBackdrop, { backgroundColor: alpha(c.scrim, 0.32) }]} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
      <View style={[styles.sheet, { backgroundColor: c.surfaceContainerLow, paddingBottom: insets.bottom + 16 }]} accessibilityViewIsModal>
        <View style={[styles.handle, { backgroundColor: c.onSurfaceVariant }]} />
        {title ? (
          <Text style={[type.titleMedium, styles.sheetTitle, { color: c.onSurfaceVariant }]} accessibilityRole="header" numberOfLines={2}>
            {title}
          </Text>
        ) : null}
        <ScrollView bounces={false} style={styles.sheetBody}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** A choice in a sheet: an icon, a label. */
export function M3SheetItem({ label, icon, destructive = false, selected, onPress }: { label: string; icon?: SymbolName; destructive?: boolean; selected?: boolean; onPress: () => void }) {
  const { c } = useM3();
  const color = destructive ? c.error : c.onSurface;
  return (
    <M3Pressable
      accessibilityRole={selected === undefined ? 'button' : 'radio'}
      accessibilityState={selected === undefined ? undefined : { selected }}
      content={color}
      onPress={onPress}
      style={styles.sheetItem}>
      {icon ? <Glyph name={icon} color={destructive ? c.error : c.onSurfaceVariant} /> : null}
      {selected !== undefined ? <Radio on={selected} /> : null}
      <Text style={[type.bodyLarge, { color, flex: 1 }]}>{label}</Text>
    </M3Pressable>
  );
}

function Radio({ on }: { on: boolean }) {
  const { c } = useM3();
  return (
    <View style={[styles.radio, { borderColor: on ? c.primary : c.onSurfaceVariant }]}>
      {on ? <View style={[styles.radioDot, { backgroundColor: c.primary }]} /> : null}
    </View>
  );
}

const ICON_FOR: Record<string, SymbolName> = {
  delete: 'delete',
  report: 'flag',
  block: 'block',
  mute: 'volume_off',
  copy: 'content_copy',
  share: 'share',
  save: 'download',
  take: 'videocam',
  choose: 'video_library',
  edit: 'edit',
};

/** Picks an icon for an action from its first word ("Delete Post" → delete). */
export function iconForAction(label: string): SymbolName | undefined {
  const word = label.toLowerCase().split(/\s/)[0] ?? '';
  return ICON_FOR[word];
}

export function M3ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: { label: string; onPress: () => void; destructive?: boolean }[];
  onClose: () => void;
}) {
  return (
    <M3Sheet visible={visible} onClose={onClose} title={title}>
      {actions.map((a) => (
        <M3SheetItem
          key={a.label}
          label={a.label}
          icon={iconForAction(a.label)}
          destructive={a.destructive}
          onPress={() => {
            onClose();
            a.onPress();
          }}
        />
      ))}
    </M3Sheet>
  );
}

/** The Android share sheet's direct targets: round tonal icons in a row, labels under. */
export function M3ShareTargets({ targets }: { targets: { label: string; icon: SymbolName; run: () => void }[] }) {
  const { c } = useM3();
  return (
    <View style={styles.targets}>
      {targets.map((t) => (
        <Pressable key={t.label} accessibilityRole="button" accessibilityLabel={t.label} onPress={t.run} style={styles.target}>
          {({ pressed }) => (
            <>
              <View style={[styles.targetIcon, { backgroundColor: c.secondaryContainer, borderRadius: pressed ? 18 : 28 }]}>
                <Glyph name={t.icon} color={c.onSecondaryContainer} />
              </View>
              <Text style={[type.labelMedium, styles.targetLabel, { color: c.onSurface }]} numberOfLines={2}>
                {t.label}
              </Text>
            </>
          )}
        </Pressable>
      ))}
    </View>
  );
}

export function M3RadioSheet<T extends string>({
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
  return (
    <M3Sheet visible={visible} onClose={onClose} title={title}>
      {options.map((o) => (
        <M3SheetItem
          key={o.value}
          label={o.label}
          selected={o.value === value}
          onPress={() => {
            onChange(o.value);
            onClose();
          }}
        />
      ))}
    </M3Sheet>
  );
}

const styles = StyleSheet.create({
  dialogBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 360, minWidth: 280, borderRadius: 28, padding: 24, paddingBottom: 18, gap: 16 },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8, marginRight: -12 },
  dialogButtonsStacked: { flexDirection: 'column', alignItems: 'flex-end' },
  dialogButton: { height: 40, paddingHorizontal: 12, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  sheetBackdrop: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    maxWidth: 640,
    marginHorizontal: 'auto',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
  },
  handle: { width: 32, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 22, marginBottom: 12, opacity: 0.4 },
  sheetTitle: { paddingHorizontal: 24, paddingVertical: 8 },
  sheetBody: { flexGrow: 0 },
  sheetItem: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 24 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  targets: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 8 },
  target: { width: '25%', alignItems: 'center', gap: 8, paddingVertical: 10 },
  targetIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  targetLabel: { textAlign: 'center', paddingHorizontal: 4 },
});
