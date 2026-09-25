import { type Account, formatHandle, type Post } from '@pinstripe/core';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { type MastodonNotification, toAccount, toPost } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { aquaText, Avatar, Card, GelButton, Pinstripes } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { Icon, type IconName } from '@/components/icon';
import { initials } from '@/components/initials';
import { relativeTime } from '@/components/relative-time';
import { ScreenHeader } from '@/components/screen-header';
import { setUnreadNotifications } from '@/hooks/use-unread-notifications';
import { usePushStatus } from '@/push/push';
import { useAccent } from '@/theme/theme';

interface Item {
  id: string;
  type: string;
  createdAt: string;
  account: Account;
  post: Post | null;
  unread: boolean;
}

/** Stands for the theme's accent colour, filled in when a row renders. */
const ACCENT = 'accent';

const KINDS: Record<string, { icon: IconName; color: string; text: string }> = {
  follow: { icon: 'person', color: ACCENT, text: 'followed you' },
  follow_request: { icon: 'lock', color: ACCENT, text: 'asked to follow you' },
  favourite: { icon: 'heart', color: '#d6336c', text: 'liked your post' },
  reblog: { icon: 'boost', color: '#2b8a3e', text: 'boosted your post' },
  mention: { icon: 'at', color: ACCENT, text: 'mentioned you' },
};

/** Follows, requests, likes, boosts, mentions and replies. Opening it marks everything read. */
export default function NotificationsScreen() {
  const { state, refreshAccount } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const server = state.status === 'signedIn' ? state.server : '';
  const [items, setItems] = useState<Item[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [end, setEnd] = useState(false);
  const loadingMore = useRef(false);
  const [push, turnOnPush] = usePushStatus();

  const toItem = useCallback(
    (n: MastodonNotification, unread: boolean): Item => ({
      id: n.id,
      type: n.type,
      createdAt: n.created_at,
      account: toAccount(n.account, server),
      post: n.status ? toPost(n.status, server) : null,
      unread,
    }),
    [server],
  );

  const load = useCallback(async () => {
    if (!client) return;
    try {
      const [unread, page] = await Promise.all([client.unreadNotifications().catch(() => 0), client.notifications()]);
      setError(null);
      setItems(page.map((n, i) => toItem(n, i < unread)));
      setEnd(page.length === 0);
      if (page[0]) {
        await client.markNotificationsRead(page[0].id).catch(() => {});
        setUnreadNotifications(0);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load notifications.');
    }
  }, [client, toItem]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const loadMore = async () => {
    const last = items?.at(-1);
    if (!client || !last || end || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const page = await client.notifications({ maxId: last.id });
      setItems((current) => [...(current ?? []), ...page.map((n) => toItem(n, false))]);
      setEnd(page.length === 0);
    } catch {
      // Scrolling again retries.
    } finally {
      loadingMore.current = false;
    }
  };

  const answer = async (item: Item, action: 'authorize' | 'reject') => {
    if (!client) return;
    try {
      await client.answerFollowRequest(item.account.id, action);
      refreshAccount();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t answer the request.');
    }
  };

  return (
    <Pinstripes>
      <ScreenHeader title="Notifications" back="Back" />
      <FlatList
        data={items ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <>
            <FormError message={error} />
            {push === 'ask' ? (
              <Card style={styles.pushCard}>
                <Text style={[aquaText.body, styles.bold]}>Get notified on this phone</Text>
                <Text style={aquaText.handle}>Likes, follows, replies and mentions, even when Pinstripe is closed.</Text>
                <GelButton small title="Turn On Notifications" onPress={turnOnPush} />
              </Card>
            ) : null}
          </>
        }
        ListEmptyComponent={
          items === null ? (
            error ? null : <ActivityIndicator style={styles.empty} />
          ) : (
            <Text style={[aquaText.handle, styles.empty]}>Nothing yet. Likes, boosts, follows and replies show up here.</Text>
          )
        }
        renderItem={({ item }) => <Row item={item} onAnswer={(action) => answer(item, action)} />}
      />
    </Pinstripes>
  );
}

function Row({ item, onAnswer }: { item: Item; onAnswer: (action: 'authorize' | 'reject') => void }) {
  const accent = useAccent();
  const found = KINDS[item.type] ?? { icon: 'bell' as const, color: ACCENT, text: 'did something' };
  const kind = { ...found, color: found.color === ACCENT ? accent.color : found.color };
  const reply = item.type === 'mention' && item.post?.inReplyToId;
  const open = () => (item.post ? router.push(`/status/${item.post.id}`) : router.push(`/profile/${item.account.id}`));
  const label = `${item.account.displayName} ${reply ? 'replied to you' : kind.text}`;
  return (
    <Card style={[styles.row, item.unread && [styles.unread, { borderColor: accent.color }]]}>
      <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={open} style={styles.main}>
        <View style={[styles.badge, { backgroundColor: kind.color }]}>
          <Icon name={reply ? 'reply' : kind.icon} size={14} color="#fff" filled={kind.icon === 'heart'} />
        </View>
        <Avatar initials={initials(item.account.displayName)} uri={item.account.avatarUrl} size={36} />
        <View style={styles.flex}>
          <Text style={aquaText.body} numberOfLines={2}>
            <Text style={styles.bold}>{item.account.displayName}</Text> {reply ? 'replied to you' : kind.text}
          </Text>
          <Text style={aquaText.handle} numberOfLines={1}>
            {formatHandle(item.account)} · {relativeTime(item.createdAt)}
          </Text>
          {item.post?.content ? (
            <Text style={[aquaText.body, styles.snippet]} numberOfLines={item.type === 'mention' ? 4 : 2}>
              {item.post.content}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {item.type === 'follow_request' ? (
        <View style={styles.buttons}>
          <GelButton tone="gray" small title="Reject" accessibilityLabel={`Reject ${item.account.displayName}`} onPress={() => onAnswer('reject')} />
          <GelButton small title="Approve" accessibilityLabel={`Approve ${item.account.displayName}`} onPress={() => onAnswer('authorize')} />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 8, flexGrow: 1 },
  row: { gap: 10 },
  unread: { borderWidth: 2 },
  main: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  badge: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  bold: { fontWeight: '700' },
  snippet: { color: '#444', marginTop: 4 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  empty: { textAlign: 'center', marginTop: 32, paddingHorizontal: 24 },
  pushCard: { gap: 8, marginBottom: 4 },
});
