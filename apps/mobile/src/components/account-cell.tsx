import { type Account, formatHandle } from '@pinstripe/core';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/aqua';
import { initials } from '@/components/initials';
import { TableCell } from '@/components/ios6';
import { fontFamily } from '@/theme/aqua';
import { useAccent } from '@/theme/theme';

/**
 * A person as a grouped-table cell: picture, name and handle (tapping them
 * opens the profile, lighting the cell up blue), and buttons on the right.
 */
export function AccountCell({ account, first, last, children }: { account: Account; first: boolean; last: boolean; children?: ReactNode }) {
  const accent = useAccent();
  return (
    <TableCell first={first} last={last} style={styles.cell}>
      <Pressable accessibilityRole="link" onPress={() => router.push(`/profile/${account.id}`)} style={styles.who}>
        {({ pressed }) => (
          <>
            {pressed ? <LinearGradient colors={accent.selection.colors} locations={accent.selection.locations} style={StyleSheet.absoluteFill} /> : null}
            <Avatar initials={initials(account.displayName)} uri={account.avatarUrl} size={40} />
            <View style={styles.text}>
              <Text style={[styles.name, pressed && styles.white]} numberOfLines={1}>
                {account.displayName}
              </Text>
              <Text style={[styles.handle, pressed && styles.white]} numberOfLines={1}>
                {formatHandle(account)}
              </Text>
            </View>
          </>
        )}
      </Pressable>
      {children ? <View style={styles.buttons}>{children}</View> : null}
    </TableCell>
  );
}

const styles = StyleSheet.create({
  cell: { flexDirection: 'row', alignItems: 'center' },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8, minHeight: 56 },
  text: { flex: 1, minWidth: 0 },
  name: { fontFamily, fontSize: 16, fontWeight: '700', color: '#000000' },
  handle: { fontFamily, fontSize: 13, color: '#7a7a7a' },
  white: { color: '#ffffff' },
  buttons: { flexDirection: 'row', gap: 6, paddingRight: 10 },
});
