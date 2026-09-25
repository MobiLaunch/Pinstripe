import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Metal } from '@/components/aqua';
import { Icon, type IconName } from '@/components/icon';
import { colors, fontFamily } from '@/theme/aqua';
import { useAccent } from '@/theme/theme';

const TABS: Record<string, { label: string; icon: IconName }> = {
  feed: { label: 'Feed', icon: 'feed' },
  index: { label: 'Videos', icon: 'play' },
  account: { label: 'Account', icon: 'account' },
};

/** Metal tab bar pinned to the bottom of the swipeable Feed ← Videos → Account pager. */
export function AquaTabBar({ state, navigation }: MaterialTopTabBarProps) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  return (
    <Metal style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]} accessibilityRole="tablist">
      {state.routes.map((route: { key: string; name: string }, index: number) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const color = focused ? accent.colorActive : '#3a3a3a';
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
            <View style={focused ? [styles.glow, { shadowColor: accent.color }] : undefined}>
              <Icon name={tab.icon} size={26} color={color} />
            </View>
            <Text style={[styles.label, { color }]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </Metal>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
  },
  tab: { minWidth: 84, minHeight: 52, alignItems: 'center', justifyContent: 'center', gap: 2 },
  glow: { shadowOpacity: 0.7, shadowRadius: 3, shadowOffset: { width: 0, height: 0 } },
  label: { fontFamily, fontSize: 11, fontWeight: '700' },
});
