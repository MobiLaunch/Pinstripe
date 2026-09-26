import { type Account, formatHandle, type Post } from '@pinstripe/core';
import { router } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, type StyleProp, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { type MastodonNotification, toAccount, toPost } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { aquaText, Avatar, Card, GelButton } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { Icon, type IconName } from '@/components/icon';
import { initials } from '@/components/initials';
import { GlassSurface, glassFont, glassText } from '@/components/liquid';
import { Linen, LinenHeader, Spinner, TableEmpty } from '@/components/ios6';
import { usePullToRefresh } from '@/components/pull-refresh';
import { relativeTime } from '@/components/relative-time';
import { ScreenHeader } from '@/components/screen-header';
import { setUnreadNotifications } from '@/hooks/use-unread-notifications';
import { usePushStatus } from '@/push/push';
import { fontFamily } from '@/theme/aqua';
import { useAccent, useGlass } from '@/theme/theme';

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

  const pull = usePullToRefresh(load);

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
    <Linen>
      <ScreenHeader title="Notifications" back="Back" />
      <FlatList
        data={items ?? []}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        {...pull.listProps}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={
          <>
            {pull.header}
            <LinenHeader title="Pinstripe" />
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
            error ? null : <Spinner color="#ffffff" style={styles.empty} />
          ) : (
            <TableEmpty title="No Notifications" dark />
          )
        }
        renderItem={({ item }) => <Row item={item} onAnswer={(action) => answer(item, action)} />}
      />
    </Linen>
  );
}

function Row({ item, onAnswer }: { item: Item; onAnswer: (action: 'authorize' | 'reject') => void }) {
  const accent = useAccent();
  const found = KINDS[item.type] ?? { icon: 'bell' as const, color: ACCENT, text: 'did something' };
  const kind = { ...found, color: found.color === ACCENT ? accent.color : found.color };
  const reply = item.type === 'mention' && item.post?.inReplyToId;
  const open = () => (item.post ? router.push(`/status/${item.post.id}`) : router.push(`/profile/${item.account.id}`));
  const label = `${item.account.displayName} ${reply ? 'replied to you' : kind.text}`;
  const glass = useGlass();
  const Platter = glass ? GlassPlatter : View;
  return (
    <Platter style={glass ? styles.platter : styles.row}>
      <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={open} style={({ pressed }) => [styles.main, pressed && styles.pressed]}>
        {/* Mail's unread dot. */}
        <View style={styles.dotSpace}>{item.unread ? <View style={[styles.dot, { backgroundColor: accent.tabIcon }]} /> : null}</View>
        <View>
          <Avatar initials={initials(item.account.displayName)} uri={item.account.avatarUrl} size={40} />
          <View style={[styles.badge, { backgroundColor: kind.color }]}>
            <Icon name={reply ? 'reply' : kind.icon} size={11} strokeWidth={2.6} color="#fff" filled={kind.icon === 'heart'} />
          </View>
        </View>
        <View style={styles.flex}>
          <View style={styles.titleLine}>
            <Text style={[styles.name, glass && styles.nameGlass]} numberOfLines={1}>
              {item.account.displayName}
            </Text>
            <Text style={[styles.time, glass && styles.timeGlass]}>{relativeTime(item.createdAt)}</Text>
          </View>
          <Text style={[styles.what, glass && styles.whatGlass]} numberOfLines={1}>
            {reply ? 'Replied to you' : kind.text[0]!.toUpperCase() + kind.text.slice(1)} · {formatHandle(item.account)}
          </Text>
          {item.post?.content ? (
            <Text style={[styles.snippet, glass && styles.snippetGlass]} numberOfLines={item.type === 'mention' ? 4 : 2}>
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
    </Platter>
  );
}

/** A notification's own pane of glass, as on the Lock Screen. */
function GlassPlatter({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <GlassSurface radius={26} style={style}>
      {children}
    </GlassSurface>
  );
}

const shadow = { textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: -1 }, textShadowRadius: 0 } as const;

const styles = StyleSheet.create({
  list: { flexGrow: 1, paddingBottom: 24 },
  // Etched dividers: a dark line with a faint light one under it.
  row: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.55)', boxShadow: '0 1px 0 rgba(255,255,255,0.07)' },
  main: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12, paddingRight: 14 },
  pressed: { backgroundColor: 'rgba(255,255,255,0.08)' },
  dotSpace: { width: 16, alignItems: 'center', paddingTop: 16 },
  dot: { width: 10, height: 10, borderRadius: 5, boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.6), 0 1px 1px rgba(0,0,0,0.6)' },
  badge: {
    position: 'absolute',
    right: -5,
    bottom: -3,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#2a2d32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  titleLine: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  name: { flex: 1, fontFamily, fontSize: 16, fontWeight: '700', color: '#ffffff', ...shadow },
  time: { fontFamily, fontSize: 12, color: '#9ca3ad', ...shadow },
  what: { fontFamily, fontSize: 13, color: '#c9ced6', ...shadow },
  snippet: { fontFamily, fontSize: 14, lineHeight: 19, color: '#e8ebef', marginTop: 4, ...shadow },
  platter: { marginHorizontal: 12, marginBottom: 10 },
  nameGlass: { fontFamily: glassFont, color: glassText.primary, textShadowColor: 'transparent', fontWeight: '600' },
  timeGlass: { fontFamily: glassFont, color: glassText.secondary, textShadowColor: 'transparent' },
  whatGlass: { fontFamily: glassFont, color: glassText.secondary, textShadowColor: 'transparent' },
  snippetGlass: { fontFamily: glassFont, color: glassText.primary, textShadowColor: 'transparent' },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 14, paddingBottom: 12 },
  empty: { fontFamily, fontSize: 17, fontWeight: '700', color: '#7c828b', textAlign: 'center', marginTop: 48, ...shadow },
  pushCard: { gap: 8, margin: 12 },
  bold: { fontWeight: '700' },
});
