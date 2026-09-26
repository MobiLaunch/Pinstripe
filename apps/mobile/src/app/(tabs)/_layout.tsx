import { type MaterialTopTabBarProps, TopTabs } from 'expo-router/js-top-tabs';

import { DrawerHost } from '@/components/m3/drawer';
import { M3NavigationBar } from '@/components/m3/navigation-bar';
import { AquaTabBar } from '@/components/tab-bar';
import { material } from '@/theme/startup';

/**
 * The three main screens sit side by side in a pager so they can be swiped:
 * Feed ← Videos → Account. Videos is the home screen.
 *
 * Android is laid out as Twitter for Android was, with TikTok's videos as a
 * tab: Home (the timeline), Watch, Search and Notifications along a Material
 * navigation bar, and your profile in the drawer behind your avatar.
 */
export default function TabsLayout() {
  if (material) return <MaterialTabs />;
  return (
    <TopTabs
      initialRouteName="index"
      tabBarPosition="bottom"
      tabBar={(props: MaterialTopTabBarProps) => <AquaTabBar {...props} />}>
      <TopTabs.Screen name="feed" />
      <TopTabs.Screen name="index" />
      <TopTabs.Screen name="account" />
      {/* Android's extra tabs. */}
      <TopTabs.Protected guard={false}>
        <TopTabs.Screen name="explore" />
        <TopTabs.Screen name="activity" />
      </TopTabs.Protected>
    </TopTabs>
  );
}

function MaterialTabs() {
  return (
    <DrawerHost>
      <TopTabs
        initialRouteName="index"
        tabBarPosition="bottom"
        backBehavior="initialRoute"
        screenOptions={{ swipeEnabled: false, animationEnabled: false, lazy: true }}
        tabBar={(props: MaterialTopTabBarProps) => <M3NavigationBar {...props} />}>
        {/* Home (the timeline), then Watch (the videos). */}
        <TopTabs.Screen name="index" />
        <TopTabs.Screen name="feed" />
        <TopTabs.Screen name="explore" />
        <TopTabs.Screen name="activity" />
        {/* Not on the bar: reached from the drawer. */}
        <TopTabs.Screen name="account" />
      </TopTabs>
    </DrawerHost>
  );
}
