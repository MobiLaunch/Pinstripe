import { formatHandle } from '@pinstripe/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { type MastodonAdminReport, toAccount, toPost } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { aquaText, Avatar, Card, GelButton, Pinstripes, Segmented } from '@/components/aqua';
import { confirm } from '@/components/confirm';
import { FormError } from '@/components/form-error';
import { initials } from '@/components/initials';
import { relativeTime } from '@/components/relative-time';
import { ScreenHeader } from '@/components/screen-header';

const VIEWS = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
] as const;

const CATEGORY_LABELS: Record<string, string> = { spam: 'Spam', violation: 'Rules', legal: 'Illegal', other: 'Other' };

/** The report queue, for moderators and admins. */
export default function ModerationScreen() {
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const server = state.status === 'signedIn' ? state.server : '';
  const [view, setView] = useState<(typeof VIEWS)[number]['value']>('open');
  const [reports, setReports] = useState<MastodonAdminReport[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    setError(null);
    try {
      setReports(await client.adminReports({ resolved: view === 'resolved' }));
    } catch (e) {
      // Signed in before becoming a moderator: the token lacks the admin scopes.
      const message = e instanceof Error ? e.message : '';
      setError(/scope/i.test(message) ? 'Sign out and in again to use moderation.' : message || 'Couldn’t load reports.');
      setReports([]);
    }
  }, [client, view]);

  useEffect(() => {
    setReports(null);
    load();
  }, [load]);

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work.');
    }
  };

  const suspend = async (report: MastodonAdminReport) => {
    const target = report.target_account;
    if (!client || !target) return;
    const name = target.account.display_name || target.account.username;
    if (await confirm(`Suspend ${name}?`, 'Their posts are hidden from everyone and they can’t sign in. This resolves the report.', 'Suspend')) {
      act(() => client.suspendAccount(target.id, report.id));
    }
  };

  return (
    <Pinstripes>
      <ScreenHeader title="Reports" back="Back" />
      <View style={styles.tabs}>
        <Segmented options={VIEWS} value={view} onChange={setView} />
      </View>
      <FlatList
        data={reports ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={<FormError message={error} />}
        ListEmptyComponent={
          reports === null ? (
            <ActivityIndicator style={styles.empty} />
          ) : error ? null : (
            <Text style={[aquaText.handle, styles.empty]}>{view === 'open' ? 'Nothing to review.' : 'No resolved reports yet.'}</Text>
          )
        }
        renderItem={({ item }) => {
          const target = item.target_account ? toAccount(item.target_account.account, server) : null;
          const reporter = item.account ? toAccount(item.account.account, server) : null;
          return (
            <Card style={styles.card}>
              {target ? (
                <Pressable accessibilityRole="link" style={styles.who} onPress={() => router.push(`/profile/${target.id}`)}>
                  <Avatar initials={initials(target.displayName)} uri={target.avatarUrl} />
                  <View style={styles.flex}>
                    <Text style={[aquaText.body, styles.bold]} numberOfLines={1}>
                      {target.displayName}
                      {item.target_account?.suspended ? ' · suspended' : ''}
                    </Text>
                    <Text style={aquaText.handle} numberOfLines={1}>
                      {formatHandle(target)}
                    </Text>
                  </View>
                  <Text style={styles.tag}>{CATEGORY_LABELS[item.category] ?? item.category}</Text>
                </Pressable>
              ) : null}
              <Text style={aquaText.handle}>
                Reported by {reporter ? formatHandle(reporter) : 'someone'} · {relativeTime(item.created_at)}
              </Text>
              {item.comment ? <Text style={aquaText.body}>“{item.comment}”</Text> : null}
              {item.statuses.map((s) => {
                const post = toPost(s, server);
                return (
                  <Pressable key={s.id} accessibilityRole="link" onPress={() => router.push(`/status/${s.id}`)} style={styles.post}>
                    <Text style={aquaText.body} numberOfLines={4}>
                      {post.content || '[media]'}
                    </Text>
                  </Pressable>
                );
              })}
              {!item.action_taken && client ? (
                <View style={styles.buttons}>
                  <GelButton tone="gray" small title="Resolve" accessibilityLabel="Resolve without action" onPress={() => act(() => client.resolveReport(item.id))} />
                  {target && !item.target_account?.suspended ? (
                    <GelButton tone="red" small title="Suspend" accessibilityLabel={`Suspend ${target.displayName}`} onPress={() => suspend(item)} />
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        }}
      />
    </Pinstripes>
  );
}

const styles = StyleSheet.create({
  tabs: { paddingHorizontal: 12, paddingTop: 12 },
  list: { padding: 12, gap: 10 },
  card: { gap: 8 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '700' },
  tag: { fontSize: 11, fontWeight: '700', color: '#fff', backgroundColor: '#b02a37', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden' },
  post: { padding: 10, borderRadius: 6, backgroundColor: '#f3f3f3', borderWidth: 1, borderColor: '#d4d4d4' },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  empty: { textAlign: 'center', marginTop: 24 },
});
