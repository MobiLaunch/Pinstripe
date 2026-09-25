import type { Account } from '@pinstripe/core';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text } from 'react-native';

import { toAccount } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { AccountCell } from '@/components/account-cell';
import { GelButton } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { Spinner, TableBackground, TableEmpty } from '@/components/ios6';
import { ScreenHeader } from '@/components/screen-header';
import { fontFamily } from '@/theme/aqua';

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
    <TableBackground>
      <ScreenHeader title={kind === 'mutes' ? 'Muted Accounts' : 'Blocked Accounts'} back="Back" />
      <FlatList
        data={accounts ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={<FormError message={error} />}
        ListEmptyComponent={
          accounts === null ? (
            error ? null : <Spinner style={styles.empty} />
          ) : (
            <TableEmpty title={kind === 'mutes' ? 'No Muted Accounts' : 'No Blocked Accounts'} />
          )
        }
        ListFooterComponent={
          accounts?.length ? (
            <Text style={styles.footer}>
              {kind === 'mutes'
                ? 'Muted people can still see and follow you; you just don’t see them.'
                : 'Blocked people can’t follow you or see your posts, and you won’t see theirs.'}
            </Text>
          ) : null
        }
        renderItem={({ item, index }) => (
          <AccountCell account={item} first={index === 0} last={index === (accounts?.length ?? 0) - 1}>
            <GelButton tone="gray" small rect title={verb} accessibilityLabel={`${verb} ${item.displayName}`} onPress={() => undo(item)} />
          </AccountCell>
        )}
      />
    </TableBackground>
  );
}

const styles = StyleSheet.create({
  list: { paddingTop: 18, paddingBottom: 24 },
  empty: { marginTop: 24 },
  footer: {
    fontFamily,
    fontSize: 15,
    color: '#4c566c',
    textAlign: 'center',
    marginTop: 10,
    marginHorizontal: 24,
    textShadowColor: '#ffffff',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
});
