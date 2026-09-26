/**
 * The navigation drawer that slides out from your avatar, as Twitter for
 * Android's did: who you are and your counts on top, then your profile,
 * requests, settings. An M3 modal drawer.
 */
import { formatHandle } from '@pinstripe/core';
import { type Href, router } from 'expo-router';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount, useSource } from '@/auth/session';
import { initials } from '@/components/initials';
import { alpha, springTo, type, useM3 } from '@/theme/m3';

import { M3Avatar } from './kit';
import { M3Pressable } from './pressable';
import { Glyph, type SymbolName } from './symbol';

const DrawerContext = createContext<() => void>(() => {});

/** Opens the drawer (from the avatar in a top app bar). */
export function useOpenDrawer() {
  return useContext(DrawerContext);
}

export function DrawerHost({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <DrawerContext.Provider value={() => setOpen(true)}>
      {children}
      <Drawer visible={open} onClose={() => setOpen(false)} />
    </DrawerContext.Provider>
  );
}

/** The avatar button that opens the drawer, for the left of a top app bar. */
export function DrawerButton() {
  const me = useAccount();
  const openDrawer = useOpenDrawer();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Open menu" onPress={openDrawer} hitSlop={8} style={styles.avatarButton}>
      <M3Avatar initials={initials(me.displayName)} uri={me.avatarUrl} size={32} />
    </Pressable>
  );
}

function Drawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c } = useM3();
  const me = useAccount();
  const source = useSource();
  const insets = useSafeAreaInsets();
  const [shown, setShown] = useState(visible);
  const [slide] = useState(() => new Animated.Value(0));
  if (visible && !shown) setShown(true);
  useEffect(() => {
    springTo(slide, visible ? 1 : 0, visible ? 'defaultSpatial' : 'fastEffects').start(({ finished }) => {
      if (finished && !visible) setShown(false);
    });
  }, [visible, slide]);

  const go = (href: Href) => () => {
    onClose();
    router.navigate(href);
  };
  const items: { label: string; icon: SymbolName; href: Href; count?: number }[] = [
    { label: 'Profile', icon: 'person', href: '/account' },
    { label: 'Find people', icon: 'person_add', href: '/search' },
    ...(me.locked || source.followRequests ? [{ label: 'Follow requests', icon: 'group' as const, href: '/follow-requests' as Href, count: source.followRequests }] : []),
    ...(source.moderator ? [{ label: 'Moderation', icon: 'shield' as const, href: '/moderation' as Href }] : []),
  ];

  return (
    <Modal visible={shown} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(c.scrim, 0.32), opacity: slide }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" accessibilityRole="button" />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.drawer,
          { backgroundColor: c.surfaceContainerLow, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 },
          { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-340, 0] }) }] },
        ]}>
        <Pressable accessibilityRole="link" accessibilityLabel="Your profile" onPress={go('/account')} style={styles.who}>
          <M3Avatar initials={initials(me.displayName)} uri={me.avatarUrl} size={56} />
          <Text style={[type.titleLarge, { color: c.onSurface, fontWeight: '700' }]} numberOfLines={1}>
            {me.displayName}
          </Text>
          <Text style={[type.bodyMedium, { color: c.onSurfaceVariant }]} numberOfLines={1}>
            {formatHandle(me)}
          </Text>
        </Pressable>
        {me.counts ? (
          <View style={styles.counts}>
            <Text style={[type.bodyMedium, { color: c.onSurfaceVariant }]}>
              <Text style={{ color: c.onSurface, fontWeight: '700' }}>{me.counts.following.toLocaleString()}</Text> Following
            </Text>
            <Text style={[type.bodyMedium, { color: c.onSurfaceVariant }]}>
              <Text style={{ color: c.onSurface, fontWeight: '700' }}>{me.counts.followers.toLocaleString()}</Text> Followers
            </Text>
          </View>
        ) : null}
        <View style={[styles.divider, { backgroundColor: c.outlineVariant }]} />
        {items.map((item) => (
          <DrawerItem key={item.label} label={item.label} icon={item.icon} count={item.count} onPress={go(item.href)} />
        ))}
        <View style={[styles.divider, { backgroundColor: c.outlineVariant }]} />
        <DrawerItem label="Settings and privacy" icon="settings" onPress={go('/settings')} />
      </Animated.View>
    </Modal>
  );
}

function DrawerItem({ label, icon, count, onPress }: { label: string; icon: SymbolName; count?: number; onPress: () => void }) {
  const { c } = useM3();
  return (
    <M3Pressable accessibilityRole="link" content={c.onSurface} onPress={onPress} style={styles.item}>
      <Glyph name={icon} color={c.onSurfaceVariant} />
      <Text style={[type.labelLarge, { color: c.onSurfaceVariant, flex: 1, fontSize: 15 }]}>{label}</Text>
      {count ? <Text style={[type.labelLarge, { color: c.onSurfaceVariant }]}>{count}</Text> : null}
    </M3Pressable>
  );
}

const styles = StyleSheet.create({
  avatarButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  drawer: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 320, maxWidth: '86%', borderTopRightRadius: 16, borderBottomRightRadius: 16, paddingHorizontal: 12 },
  who: { paddingHorizontal: 16, gap: 6, marginBottom: 8 },
  counts: { flexDirection: 'row', gap: 16, paddingHorizontal: 16, marginBottom: 16 },
  divider: { height: 1, marginHorizontal: 16, marginVertical: 8 },
  item: { height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 24 },
});
