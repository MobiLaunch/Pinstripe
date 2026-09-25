/**
 * On a computer's browser, the app sits in a phone-width column on the
 * dark iOS linen, the way iPad apps framed their content, instead of
 * stretching every screen across the monitor. Phones and narrow windows
 * get the app edge to edge as before.
 */
import type { ReactNode } from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Linen } from '@/components/ios6';

/** Widest the app's column gets. */
export const COLUMN_WIDTH = 440;
const DESKTOP_FROM = 700;

export function DesktopFrame({ children }: { children: ReactNode }) {
  const { width } = useWindowDimensions();
  if (Platform.OS !== 'web' || width < DESKTOP_FROM) return <>{children}</>;
  return (
    <Linen style={styles.desk}>
      <View style={styles.column}>{children}</View>
    </Linen>
  );
}

const styles = StyleSheet.create({
  desk: { alignItems: 'center' },
  column: {
    flex: 1,
    width: COLUMN_WIDTH,
    overflow: 'hidden',
    backgroundColor: '#000000',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.6), 0 0 40px rgba(0,0,0,0.6)',
  },
});
