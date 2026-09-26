import { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/session';
import { GelButton, TableField } from '@/components/aqua';
import { confirm } from '@/components/confirm';
import { FormError } from '@/components/form-error';
import { Spinner, TableBackground, TableCell, TableEmpty, TableGroup, TableTitle } from '@/components/ios6';
import { ScreenHeader } from '@/components/screen-header';
import { fontFamily } from '@/theme/aqua';

/** Servers whose people and posts you never want to see. */
export default function BlockedServersScreen() {
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const [domains, setDomains] = useState<string[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setDomains(await client.domainBlocks());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load blocked servers.');
    }
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const domain = draft.trim();
    if (!client || !domain) return;
    if (!(await confirm(`Block ${domain}?`, 'You won’t see posts or notifications from anyone there, and your followers from there are removed.', 'Block'))) return;
    setBusy(true);
    setError(null);
    try {
      await client.blockDomain(domain, 'block');
      setDraft('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t block that server.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (domain: string) => {
    if (!client) return;
    setDomains((list) => list?.filter((d) => d !== domain) ?? null);
    try {
      await client.blockDomain(domain, 'unblock');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t unblock that server.');
      load();
    }
  };

  return (
    <TableBackground>
      <ScreenHeader title="Blocked Servers" back="Back" />
      <FlatList
        data={domains ?? []}
        keyExtractor={(d) => d}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            <FormError message={error} />
            <TableGroup footer="Blocking a server hides everyone there from you: their posts, replies and notifications.">
              <TableField
                label="Server"
                placeholder="example.social"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={add}
              />
            </TableGroup>
            <GelButton rect title={busy ? 'Blocking…' : 'Block Server'} disabled={busy || !draft.trim()} onPress={add} style={styles.button} />
            {domains?.length ? <TableTitle title="Blocked" /> : null}
          </View>
        }
        ListEmptyComponent={domains === null ? error ? null : <Spinner style={styles.empty} /> : <TableEmpty title="No Servers Blocked" />}
        renderItem={({ item, index }) => (
          <TableCell first={index === 0} last={index === (domains?.length ?? 0) - 1} style={styles.row}>
            <Text style={styles.domain} numberOfLines={1}>
              {item}
            </Text>
            <GelButton tone="gray" small rect title="Unblock" accessibilityLabel={`Unblock ${item}`} onPress={() => remove(item)} />
          </TableCell>
        )}
      />
    </TableBackground>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 24 },
  button: { marginHorizontal: 10, marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 12, paddingVertical: 6 },
  domain: { flex: 1, fontFamily, fontSize: 17, fontWeight: '700', color: '#000000' },
  empty: { marginTop: 24 },
});
