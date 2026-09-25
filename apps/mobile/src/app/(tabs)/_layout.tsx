import { type MaterialTopTabBarProps, TopTabs } from 'expo-router/js-top-tabs';

import { AquaTabBar } from '@/components/tab-bar';

/**
 * The three main screens sit side by side in a pager so they can be swiped:
 * Feed ← Videos → Account. Videos is the home screen.
 */
export default function TabsLayout() {
  return (
    <TopTabs
      initialRouteName="index"
      tabBarPosition="bottom"
      tabBar={(props: MaterialTopTabBarProps) => <AquaTabBar {...props} />}>
      <TopTabs.Screen name="feed" />
      <TopTabs.Screen name="index" />
      <TopTabs.Screen name="account" />
    </TopTabs>
  );
}
