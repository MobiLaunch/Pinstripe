import { type Account, formatHandle } from '@pinstripe/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { toAccount } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { aquaText, Avatar, Card, GelButton, Pinstripes } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { initials } from '@/components/initials';
import { ScreenHeader } from '@/components/screen-header';

/** Accounts you've muted or blocked, each with a way to undo it. */
export default function BlockedAccountsScreen() {
  const { kind: param } = useLocalSearchParams<{ kind?: string }>();
  const kind = param === 'mutes' ? 'mutes' : 'blocks';
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const server = state.status === 'signedIn' ? state.server : '';
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setAccounts((await client.blockedAccounts(kind)).map((a) => toAccount(a, server)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load the list.');
    }
  }, [client, server, kind]);

  useEffect(() => {
    load();
  }, [load]);

  const undo = async (account: Account) => {
    if (!client) return;
    setAccounts((list) => list?.filter((a) => a.id !== account.id) ?? null);
    try {
      if (kind === 'mutes') await client.unmute(account.id);
      else await client.block(account.id, 'unblock');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work.');
      load();
    }
  };

  const verb = kind === 'mutes' ? 'Unmute' : 'Unblock';
  return (
    <Pinstripes>
      <ScreenHeader title={kind === 'mutes' ? 'Muted Accounts' : 'Blocked Accounts'} back="Back" />
      <FlatList
        data={accounts ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<FormError message={error} />}
        ListEmptyComponent={
          accounts === null ? (
            error ? null : <ActivityIndicator style={styles.empty} />
          ) : (
            <Text style={[aquaText.handle, styles.empty]}>
              {kind === 'mutes' ? 'You haven’t muted anyone.' : 'You haven’t blocked anyone.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <Pressable accessibilityRole="link" style={styles.who} onPress={() => router.push(`/profile/${item.id}`)}>
              <Avatar initials={initials(item.displayName)} uri={item.avatarUrl} />
              <View style={styles.flex}>
                <Text style={[aquaText.body, styles.bold]} numberOfLines={1}>
                  {item.displayName}
                </Text>
                <Text style={aquaText.handle} numberOfLines={1}>
                  {formatHandle(item)}
                </Text>
              </View>
            </Pressable>
            <GelButton tone="gray" small title={verb} accessibilityLabel={`${verb} ${item.displayName}`} onPress={() => undo(item)} />
          </Card>
        )}
      />
    </Pinstripes>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  who: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 24 },
});
