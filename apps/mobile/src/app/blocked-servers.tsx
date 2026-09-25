import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/session';
import { aquaText, Card, Field, GelButton } from '@/components/aqua';
import { confirm } from '@/components/confirm';
import { FormError } from '@/components/form-error';
import { TableBackground } from '@/components/ios6';
import { ScreenHeader } from '@/components/screen-header';

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
          <View style={styles.header}>
            <FormError message={error} />
            <Card style={styles.add}>
              <Field
                label="Server"
                placeholder="example.social"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={add}
              />
              <GelButton small title={busy ? 'Blocking…' : 'Block Server'} disabled={busy || !draft.trim()} onPress={add} />
            </Card>
          </View>
        }
        ListEmptyComponent={
          domains === null ? (
            error ? null : <ActivityIndicator style={styles.empty} />
          ) : (
            <Text style={[aquaText.handle, styles.empty]}>No servers blocked.</Text>
          )
        }
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <Text style={[aquaText.body, styles.flex]}>{item}</Text>
            <GelButton tone="gray" small title="Unblock" accessibilityLabel={`Unblock ${item}`} onPress={() => remove(item)} />
          </Card>
        )}
      />
    </TableBackground>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 8 },
  header: { gap: 8, marginBottom: 4 },
  add: { gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  empty: { textAlign: 'center', marginTop: 24 },
});
