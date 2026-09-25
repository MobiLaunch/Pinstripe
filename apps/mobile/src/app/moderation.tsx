import { formatHandle } from '@pinstripe/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { type MastodonAdminReport, type MastodonClient, type MastodonServerBlock, toAccount, toPost } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { aquaText, Avatar, Card, Field, GelButton, Segmented } from '@/components/aqua';
import { confirm } from '@/components/confirm';
import { FormError } from '@/components/form-error';
import { initials } from '@/components/initials';
import { relativeTime } from '@/components/relative-time';
import { TableBackground } from '@/components/ios6';
import { ScreenHeader } from '@/components/screen-header';

const VIEWS = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
] as const;

const CATEGORY_LABELS: Record<string, string> = { spam: 'Spam', violation: 'Rules', legal: 'Illegal', other: 'Other' };

const PANES = [
  { value: 'reports', label: 'Reports' },
  { value: 'servers', label: 'Servers' },
  { value: 'log', label: 'Log' },
] as const;

/** Moderation, for moderators and admins: reports, blocked servers, and the log of what's been done. */
export default function ModerationScreen() {
  const [pane, setPane] = useState<(typeof PANES)[number]['value']>('reports');
  return (
    <TableBackground>
      <ScreenHeader title="Moderation" back="Back" />
      <View style={styles.tabs}>
        <Segmented options={PANES} value={pane} onChange={setPane} />
      </View>
      {pane === 'reports' ? <ReportsPane /> : pane === 'servers' ? <ServersPane /> : <LogPane />}
    </TableBackground>
  );
}

/** Signed in before becoming a moderator: the token lacks the admin scopes. */
function problem(e: unknown, fallback: string) {
  const message = e instanceof Error ? e.message : '';
  return /scope/i.test(message) ? 'Sign out and in again to use moderation.' : message || fallback;
}

/** The report queue. */
function ReportsPane() {
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
      setError(problem(e, 'Couldn’t load reports.'));
      setReports([]);
    }
  }, [client, view]);

  // Switching between open and resolved shows the spinner straight away.
  const [shownView, setShownView] = useState(view);
  if (shownView !== view) {
    setShownView(view);
    setReports(null);
  }

  useEffect(() => {
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

  const moderate = async (report: MastodonAdminReport, type: 'suspend' | 'silence') => {
    const target = report.target_account;
    if (!client || !target) return;
    const name = target.account.display_name || target.account.username;
    const ok =
      type === 'suspend'
        ? await confirm(`Suspend ${name}?`, 'Their posts are hidden from everyone and they can’t sign in. This resolves the report.', 'Suspend')
        : await confirm(`Limit ${name}?`, 'Only people who already follow them will see their posts and hear from them. This resolves the report.', 'Limit');
    if (ok) act(() => client.moderateAccount(target.id, type, report.id));
  };

  return (
    <>
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
                      {item.target_account?.suspended ? ' · suspended' : item.target_account?.silenced ? ' · limited' : ''}
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
                  {target && !item.target_account?.suspended && !item.target_account?.silenced ? (
                    <GelButton tone="gray" small title="Limit" accessibilityLabel={`Limit ${target.displayName}`} onPress={() => moderate(item, 'silence')} />
                  ) : null}
                  {target && !item.target_account?.suspended ? (
                    <GelButton tone="red" small title="Suspend" accessibilityLabel={`Suspend ${target.displayName}`} onPress={() => moderate(item, 'suspend')} />
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        }}
      />
    </>
  );
}

const SEVERITIES = [
  { value: 'silence', label: 'Limit' },
  { value: 'suspend', label: 'Suspend' },
] as const;

/** Servers blocked for everyone here. */
function ServersPane() {
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const [blocks, setBlocks] = useState<MastodonServerBlock[] | null>(null);
  const [domain, setDomain] = useState('');
  const [severity, setSeverity] = useState<'silence' | 'suspend'>('silence');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setBlocks(await client.serverBlocks());
    } catch (e) {
      setError(problem(e, 'Couldn’t load blocked servers.'));
      setBlocks([]);
    }
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    const name = domain.trim();
    if (!client || !name) return;
    const what =
      severity === 'suspend'
        ? 'Nothing from there will reach anyone here, nothing goes back, and every follow with accounts there ends.'
        : 'Its accounts will only be seen by people here who already follow them.';
    if (!(await confirm(`${severity === 'suspend' ? 'Suspend' : 'Limit'} ${name}?`, what, severity === 'suspend' ? 'Suspend' : 'Limit'))) return;
    setBusy(true);
    setError(null);
    try {
      await client.blockServer({ domain: name, severity, public_comment: reason.trim() });
      setDomain('');
      setReason('');
      await load();
    } catch (e) {
      setError(problem(e, 'Couldn’t block that server.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (block: MastodonServerBlock) => {
    if (!client || !(await confirm(`Unblock ${block.domain}?`, 'Follows that were removed don’t come back by themselves.', 'Unblock'))) return;
    try {
      await client.unblockServer(block.id);
      await load();
    } catch (e) {
      setError(problem(e, 'Couldn’t unblock that server.'));
    }
  };

  return (
    <FlatList
      data={blocks ?? []}
      keyExtractor={(b) => b.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <FormError message={error} />
          <Card style={styles.card}>
            <Field label="Server" placeholder="spam.example" autoCapitalize="none" autoCorrect={false} keyboardType="url" value={domain} onChangeText={setDomain} />
            <Segmented options={SEVERITIES} value={severity} onChange={setSeverity} />
            <Field label="Reason (shown publicly)" value={reason} onChangeText={setReason} />
            <GelButton small tone={severity === 'suspend' ? 'red' : 'blue'} title={busy ? 'Saving…' : 'Block Server'} disabled={busy || !domain.trim()} onPress={add} />
          </Card>
        </View>
      }
      ListEmptyComponent={blocks === null ? <ActivityIndicator style={styles.empty} /> : <Text style={[aquaText.handle, styles.empty]}>No servers blocked.</Text>}
      renderItem={({ item }) => (
        <Card style={styles.serverRow}>
          <View style={styles.flex}>
            <Text style={[aquaText.body, styles.bold]}>{item.domain}</Text>
            <Text style={aquaText.handle}>
              {item.severity === 'suspend' ? 'Suspended' : 'Limited'} · {relativeTime(item.created_at)}
              {item.public_comment ? ` · ${item.public_comment}` : ''}
            </Text>
          </View>
          <GelButton tone="gray" small title="Unblock" accessibilityLabel={`Unblock ${item.domain}`} onPress={() => remove(item)} />
        </Card>
      )}
    />
  );
}

const LOG_LABELS: Record<string, string> = {
  suspend: 'suspended',
  unsuspend: 'lifted the suspension of',
  limit: 'limited',
  unlimit: 'lifted the limit on',
  resolve_report: 'resolved a report about',
  reopen_report: 'reopened a report about',
  suspend_server: 'suspended the server',
  limit_server: 'limited the server',
  unblock_server: 'unblocked the server',
};

/** What moderators have done, newest first. */
function LogPane() {
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const [entries, setEntries] = useState<Awaited<ReturnType<MastodonClient['moderationLog']>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client
      ?.moderationLog()
      .then(setEntries)
      .catch((e) => {
        setError(problem(e, 'Couldn’t load the log.'));
        setEntries([]);
      });
  }, [client]);

  return (
    <FlatList
      data={entries ?? []}
      keyExtractor={(e) => e.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={<FormError message={error} />}
      ListEmptyComponent={entries === null ? <ActivityIndicator style={styles.empty} /> : <Text style={[aquaText.handle, styles.empty]}>Nothing yet.</Text>}
      renderItem={({ item }) => (
        <Card style={styles.logRow}>
          <Text style={aquaText.body}>
            <Text style={styles.bold}>{item.moderator ? `@${item.moderator.username}` : 'A moderator'}</Text> {LOG_LABELS[item.action] ?? item.action}{' '}
            <Text style={styles.bold}>{item.summary}</Text>
          </Text>
          <Text style={aquaText.handle}>{relativeTime(item.created_at)}</Text>
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: 4 },
  serverRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logRow: { gap: 2 },
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
