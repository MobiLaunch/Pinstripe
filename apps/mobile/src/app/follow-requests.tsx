import { type Account, formatHandle } from '@pinstripe/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { toAccount } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { aquaText, Avatar, Card, GelButton, Pinstripes } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { initials } from '@/components/initials';
import { ScreenHeader } from '@/components/screen-header';

/** People waiting for you to approve their follow (when "Approve new followers" is on). */
export default function FollowRequestsScreen() {
  const { state, refreshAccount } = useAuth();
  const [requests, setRequests] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = state.status === 'signedIn' ? state.client : null;
  const server = state.status === 'signedIn' ? state.server : '';

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setRequests((await client.followRequests()).map((a) => toAccount(a, server)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load requests.');
    }
  }, [client, server]);

  useEffect(() => {
    load();
  }, [load]);

  const answer = async (account: Account, action: 'authorize' | 'reject') => {
    if (!client) return;
    setRequests((rs) => rs?.filter((r) => r.id !== account.id) ?? null);
    try {
      await client.answerFollowRequest(account.id, action);
      refreshAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t answer the request.');
      load();
    }
  };

  return (
    <Pinstripes>
      <ScreenHeader title="Follow Requests" back="Back" />
      <FlatList
        data={requests ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<FormError message={error} />}
        ListEmptyComponent={
          requests === null ? <ActivityIndicator style={styles.empty} /> : <Text style={[aquaText.handle, styles.empty]}>No requests right now.</Text>
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
            <View style={styles.buttons}>
              <GelButton tone="gray" small title="Reject" accessibilityLabel={`Reject ${item.displayName}`} onPress={() => answer(item, 'reject')} />
              <GelButton small title="Approve" accessibilityLabel={`Approve ${item.displayName}`} onPress={() => answer(item, 'authorize')} />
            </View>
          </Card>
        )}
      />
    </Pinstripes>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 8 },
  row: { gap: 10 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '700' },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  empty: { textAlign: 'center', marginTop: 24 },
});
