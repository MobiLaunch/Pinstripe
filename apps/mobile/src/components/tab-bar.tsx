import { LinearGradient } from 'expo-linear-gradient';
import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSwell } from '@/components/glass-motion';
import { Icon, type IconName } from '@/components/icon';
import { Badge } from '@/components/ios6';
import { GlassSurface, glassFont, glassText } from '@/components/liquid';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
import { fontFamily } from '@/theme/aqua';
import { useAccent, useGlass } from '@/theme/theme';

const TABS: Record<string, { label: string; icon: IconName }> = {
  feed: { label: 'Feed', icon: 'feed' },
  index: { label: 'Videos', icon: 'play' },
  account: { label: 'Account', icon: 'account' },
};

/**
 * The iOS 6 tab bar: black glass, the selected tab lifted in a lighter box
 * with its icon glowing. Pinned under the swipeable Feed ← Videos → Account pager.
 */
export function AquaTabBar(props: MaterialTopTabBarProps) {
  return useGlass() ? <GlassTabBar {...props} /> : <Ios6TabBar {...props} />;
}

const GLASS_BAR = 64;

/**
 * Room to leave at the bottom of a tab's content: the Glass tab bar floats
 * over the screen, so lists and captions keep clear of it.
 */
export function useTabBarInset(): number {
  const glass = useGlass();
  const insets = useSafeAreaInsets();
  return glass ? GLASS_BAR + Math.max(insets.bottom, 12) + 8 : 0;
}

/**
 * The Liquid Glass tab bar: a capsule of glass floating above the content,
 * the current tab picked out in the accent colour on a lozenge of its own.
 * Over the videos it's dark glass.
 */
function GlassTabBar({ state, navigation, position }: MaterialTopTabBarProps) {
  const insets = useSafeAreaInsets();
  const unread = useUnreadNotifications();
  const overVideo = state.routes[state.index]?.name === 'index';
  const [width, setWidth] = useState(0);
  const count = state.routes.length;
  const tab = width ? (width - 8) / count : 0;
  // The pager's live position (fractional mid-swipe), so the lozenge moves with your finger.
  const [fallback] = useState(() => new Animated.Value(state.index));
  useEffect(() => {
    if (!position) Animated.spring(fallback, { toValue: state.index, speed: 14, bounciness: 6, useNativeDriver: true }).start();
  }, [position, fallback, state.index]);
  const at: Animated.AnimatedInterpolation<number> | Animated.Value = position ?? fallback;
  const indices = state.routes.map((_: unknown, i: number) => i);
  return (
    <View style={[styles.glassWrap, { bottom: Math.max(insets.bottom, 12) }]} pointerEvents="box-none">
      <GlassSurface
        radius={GLASS_BAR / 2}
        dark={overVideo}
        style={styles.glassBar}
        accessibilityRole="tablist"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {tab ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.glassLozenge,
              overVideo ? styles.glassTabOnDark : styles.glassTabOn,
              { width: tab, transform: [{ translateX: at.interpolate({ inputRange: indices, outputRange: indices.map((i: number) => i * tab) }) }] },
            ]}
          />
        ) : null}
        {state.routes.map((route: { key: string; name: string }, index: number) => {
          const meta = TABS[route.name];
          if (!meta) return null;
          const focused = state.index === index;
          return (
            <GlassTab
              key={route.key}
              label={meta.label}
              icon={meta.icon}
              focused={focused}
              overVideo={overVideo}
              badge={route.name === 'feed' ? unread : 0}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
            />
          );
        })}
      </GlassSurface>
    </View>
  );
}

/** One tab: its symbol and name, swelling a little while pressed. */
function GlassTab({
  label,
  icon,
  focused,
  overVideo,
  badge,
  onPress,
}: {
  label: string;
  icon: IconName;
  focused: boolean;
  overVideo: boolean;
  badge: number;
  onPress: () => void;
}) {
  const swell = useSwell({ to: 1.12 });
  const color = focused ? glassText.blue : overVideo ? '#ffffff' : glassText.primary;
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected: focused }} accessibilityLabel={label} onPress={onPress} style={styles.glassTab} {...swell.handlers}>
      <Animated.View style={[styles.glassTabInner, { transform: [{ scale: swell.scale }] }]}>
        <Icon name={icon} size={24} strokeWidth={2.2} color={color} filled={focused && icon === 'play'} />
        <Text style={[styles.glassLabel, { color }]}>{label}</Text>
      </Animated.View>
      {badge ? <Badge count={badge} style={styles.glassBadge} /> : null}
    </Pressable>
  );
}

function Ios6TabBar({ state, navigation }: MaterialTopTabBarProps) {
  const accent = useAccent();
  const insets = useSafeAreaInsets();
  const unread = useUnreadNotifications();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 4) }]} accessibilityRole="tablist">
      {/* Black glass: a lit upper half over a deep lower one. */}
      <LinearGradient colors={['#4a4a4a', '#2a2a2a', '#111111', '#030303']} locations={[0, 0.5, 0.5, 1]} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.03)']} style={styles.gloss} pointerEvents="none" />
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
            {focused ? (
              <View style={styles.selected} pointerEvents="none">
                <LinearGradient colors={['rgba(255,255,255,0.26)', 'rgba(255,255,255,0.1)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.09)']} locations={[0, 0.5, 0.5, 1]} style={StyleSheet.absoluteFill} />
              </View>
            ) : null}
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
  shine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.28)' },
  gloss: { position: 'absolute', top: 0, left: 0, right: 0, height: '50%' },
  tab: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 1 },
  selected: {
    ...StyleSheet.absoluteFill,
    margin: 2,
    borderRadius: 4,
    overflow: 'hidden',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(255,255,255,0.06), 0 0 0 1px rgba(0,0,0,0.6)',
  },
  glow: { borderRadius: 14 },
  label: { fontFamily, fontSize: 10, fontWeight: '700', color: '#9a9a9a' },
  labelOn: { color: '#ffffff' },
  badge: { position: 'absolute', top: 0, right: '22%' },
  glassWrap: { position: 'absolute', left: 20, right: 20 },
  glassBar: { height: GLASS_BAR, flexDirection: 'row', alignItems: 'center', padding: 4 },
  glassTab: { flex: 1, height: GLASS_BAR - 8, alignItems: 'center', justifyContent: 'center' },
  glassTabInner: { alignItems: 'center', gap: 2 },
  glassLozenge: { position: 'absolute', top: 4, left: 4, height: GLASS_BAR - 8, borderRadius: (GLASS_BAR - 8) / 2 },
  glassTabOn: { backgroundColor: 'rgba(120,120,128,0.16)' },
  glassTabOnDark: { backgroundColor: 'rgba(255,255,255,0.14)' },
  glassLabel: { fontFamily: glassFont, fontSize: 10, fontWeight: '600' },
  glassBadge: { position: 'absolute', top: 4, right: '26%' },
});
