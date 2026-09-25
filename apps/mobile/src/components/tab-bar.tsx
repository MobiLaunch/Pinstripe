import { LinearGradient } from 'expo-linear-gradient';
import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { Badge } from '@/components/ios6';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import { fontFamily } from '@/theme/aqua';
import { useAccent } from '@/theme/theme';

const TABS: Record<string, { label: string; icon: IconName }> = {
  feed: { label: 'Feed', icon: 'feed' },
  index: { label: 'Videos', icon: 'play' },
  account: { label: 'Account', icon: 'account' },
};

/**
 * The iOS 6 tab bar: black glass, the selected tab lifted in a lighter box
 * with its icon glowing. Pinned under the swipeable Feed ← Videos → Account pager.
 */
export function AquaTabBar({ state, navigation }: MaterialTopTabBarProps) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const unread = useUnreadNotifications();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 4) }]} accessibilityRole="tablist">
      <LinearGradient colors={['#3f3f3f', '#262626', '#131313', '#070707']} locations={[0, 0.5, 0.5, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.shine} pointerEvents="none" />
      {state.routes.map((route: { key: string; name: string }, index: number) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.label}
            onPress={() => {
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={styles.tab}>
            {focused ? <View style={styles.selected} pointerEvents="none" /> : null}
            <View style={focused ? [styles.glow, { boxShadow: `0 0 8px ${accent.tabIcon}` }] : undefined}>
              <Icon name={tab.icon} size={28} strokeWidth={2.4} color={focused ? accent.tabIcon : '#8f8f8f'} filled={focused && tab.icon === 'play'} />
            </View>
            <Text style={[styles.label, focused && styles.labelOn]}>{tab.label}</Text>
            {route.name === 'feed' && unread ? <Badge count={unread} style={styles.badge} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 3,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#000000',
    overflow: 'hidden',
  },
  shine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.22)' },
  tab: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 1 },
  selected: {
    ...StyleSheet.absoluteFill,
    margin: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.13)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 1px rgba(0,0,0,0.5)',
  },
  glow: { borderRadius: 14 },
  label: { fontFamily, fontSize: 10, fontWeight: '700', color: '#9a9a9a' },
  labelOn: { color: '#ffffff' },
  badge: { position: 'absolute', top: 0, right: '22%' },
});
