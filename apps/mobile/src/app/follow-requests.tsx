import type { Account } from '@pinstripe/core';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { toAccount } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { AccountCell } from '@/components/account-cell';
import { GelButton } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { Spinner, TableBackground, TableEmpty } from '@/components/ios6';
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
    <TableBackground>
      <ScreenHeader title="Follow Requests" back="Back" />
      <FlatList
        data={requests ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<FormError message={error} />}
        ListEmptyComponent={requests === null ? <Spinner style={styles.empty} /> : <TableEmpty title="No Follow Requests" />}
        renderItem={({ item, index }) => (
          <AccountCell account={item} first={index === 0} last={index === (requests?.length ?? 0) - 1}>
            <GelButton tone="gray" small rect title="Reject" accessibilityLabel={`Reject ${item.displayName}`} onPress={() => answer(item, 'reject')} />
            <GelButton small rect title="Approve" accessibilityLabel={`Approve ${item.displayName}`} onPress={() => answer(item, 'authorize')} />
          </AccountCell>
        )}
      />
    </TableBackground>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: 18, paddingBottom: 24 },
  empty: { marginTop: 24 },
});
