/**
 * The M3 navigation bar: Home, Watch, Search, Notifications. The chosen
 * destination's icon fills in on a pill that springs open from its centre.
 * Over Watch's full-screen videos the bar goes black, as TikTok's does.
 */
import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import { springTo, type, useM3 } from '@/theme/m3';

import { M3Badge } from './kit';
import { Glyph, type SymbolName } from './symbol';

/** By route: on Android, index is Home and feed is Watch (see app/(tabs)). */
export const DESTINATIONS: Record<string, { label: string; icon: SymbolName }> = {
  index: { label: 'Home', icon: 'home' },
  feed: { label: 'Watch', icon: 'play_arrow' },
  explore: { label: 'Search', icon: 'search' },
  activity: { label: 'Notifications', icon: 'notifications' },
};

export const NAV_BAR_HEIGHT = 80;

export function M3NavigationBar({ state, navigation }: MaterialTopTabBarProps) {
  const { c } = useM3();
  const insets = useSafeAreaInsets();
  const unread = useUnreadNotifications();
  const current = state.routes[state.index]?.name;
  const onVideo = current === 'feed';
  const colors = onVideo
    ? { bar: '#000000', on: '#ffffff', off: 'rgba(255,255,255,0.72)', pill: 'rgba(255,255,255,0.18)', onPill: '#ffffff' }
    : { bar: c.surfaceContainer, on: c.onSurface, off: c.onSurfaceVariant, pill: c.secondaryContainer, onPill: c.onSecondaryContainer };
  return (
    <View style={[styles.bar, { backgroundColor: colors.bar, paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      {state.routes.map((route: { key: string; name: string; params?: object }, index: number) => {
        const destination = DESTINATIONS[route.name];
        if (!destination) return null;
        const focused = state.index === index;
        const badge = route.name === 'activity' ? unread : 0;
        return (
          <Destination
            key={route.key}
            label={destination.label}
            icon={destination.icon}
            focused={focused}
            badge={badge}
            colors={colors}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
            }}
          />
        );
      })}
    </View>
  );
}

function Destination({
  label,
  icon,
  focused,
  badge,
  colors,
  onPress,
}: {
  label: string;
  icon: SymbolName;
  focused: boolean;
  badge: number;
  colors: { on: string; off: string; pill: string; onPill: string };
  onPress: () => void;
}) {
  const [open] = useState(() => new Animated.Value(focused ? 1 : 0));
  useEffect(() => {
    springTo(open, focused ? 1 : 0, 'fastSpatial').start();
  }, [focused, open]);
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={badge ? `${label}, ${badge} new` : label}
      onPress={onPress}
      style={styles.destination}>
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.pill, { backgroundColor: colors.pill, opacity: open, transform: [{ scaleX: open.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]} />
        <Glyph name={icon} color={focused ? colors.onPill : colors.off} filled={focused} />
        {badge ? <M3Badge count={badge} style={styles.badge} /> : null}
      </View>
      <Text style={[type.labelMedium, { color: focused ? colors.on : colors.off, fontWeight: focused ? '700' : '600' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row' },
  destination: { flex: 1, height: NAV_BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 4 },
  iconWrap: { width: 64, height: 32, alignItems: 'center', justifyContent: 'center' },
  pill: { ...StyleSheet.absoluteFill, borderRadius: 16 },
  badge: { position: 'absolute', top: 0, left: 36 },
});
