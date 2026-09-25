import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { aquaText, GelButton, Metal } from '@/components/aqua';

/** Metal title bar with an optional back button (left) and action (right). */
export function ScreenHeader({ title, back, right }: { title: string; back?: string; right?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Metal style={[styles.bar, { paddingTop: insets.top }]}>
      <View style={styles.inner}>
        <View style={styles.side}>
          {back ? <GelButton tone="gray" small title={back} onPress={() => router.back()} /> : null}
        </View>
        <Text style={aquaText.title} accessibilityRole="header">{title}</Text>
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
    </Metal>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: 1 },
  inner: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  side: { flex: 1, flexDirection: 'row' },
  right: { justifyContent: 'flex-end' },
});
