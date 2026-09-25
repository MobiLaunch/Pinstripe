import { type Account, formatHandle } from '@pinstripe/core';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { toAccount } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { aquaText, Avatar, Card, Pinstripes } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { initials } from '@/components/initials';
import { SearchBar } from '@/components/ios6';
import { ScreenHeader } from '@/components/screen-header';

/**
 * Find people here or anywhere on the fediverse: a name finds accounts we
 * know; a full handle (@user@server) or profile link is looked up on its server.
 */
export default function SearchScreen() {
  const { state } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Account[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (state.status !== 'signedIn' || q.length < 2) return;
    // Wait for a pause in typing; full handles trigger a network lookup.
    const run = ++latest.current;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const { accounts } = await state.client.search(q);
        if (run === latest.current) {
          setResults(accounts.map((a) => toAccount(a, state.server)));
          setError(null);
        }
      } catch (e) {
        if (run === latest.current) setError(e instanceof Error ? e.message : 'Search failed.');
      } finally {
        if (run === latest.current) setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, state]);

  return (
    <Pinstripes>
      <ScreenHeader title="Find People" back="Back" />
      <SearchBar accessibilityLabel="Search" placeholder="Name, @user@server or profile link" autoFocus value={query} onChangeText={setQuery} />
      {searching ? <ActivityIndicator style={styles.searching} /> : null}
      <FlatList
        // Too short to search: nothing, rather than the last search's results.
        data={query.trim().length < 2 ? [] : results}
        keyExtractor={(a) => a.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<FormError message={error} />}
        ListEmptyComponent={
          query.trim().length >= 2 && !searching && !error ? (
            <Text style={[aquaText.handle, styles.empty]}>No one found. Try their full handle, like @name@mastodon.social.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable accessibilityRole="link" onPress={() => router.push(`/profile/${item.id}`)}>
            <Card style={styles.row}>
              <Avatar initials={initials(item.displayName)} uri={item.avatarUrl} />
              <View style={styles.flex}>
                <Text style={[aquaText.body, styles.bold]} numberOfLines={1}>
                  {item.displayName}
                </Text>
                <Text style={aquaText.handle} numberOfLines={1}>
                  {formatHandle(item)}
                </Text>
              </View>
              <Icon name="chevronRight" size={16} color="#777" />
            </Card>
          </Pressable>
        )}
      />
    </Pinstripes>
  );
}

const styles = StyleSheet.create({
  searching: { marginTop: 10 },
  list: { paddingHorizontal: 12, gap: 8, paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '700' },
  empty: { textAlign: 'center', marginTop: 24, paddingHorizontal: 24 },
});
