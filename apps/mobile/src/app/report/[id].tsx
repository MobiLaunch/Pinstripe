import { type Account, formatHandle, type Post } from '@pinstripe/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { type ReportCategory, toAccount, toPost } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { aquaText, Card, GelButton, Pinstripes, Segmented } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { colors, fontFamily } from '@/theme/aqua';

const CATEGORIES: { value: ReportCategory; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'violation', label: 'Rules' },
  { value: 'legal', label: 'Illegal' },
  { value: 'other', label: 'Other' },
];

const HINTS: Record<ReportCategory, string> = {
  spam: 'Ads, scams, or the same thing posted over and over.',
  violation: 'Harassment, hate, or something else against the server rules.',
  legal: 'Something you think is illegal where you or the server are.',
  other: 'Something else the moderators should look at.',
};

const COMMENT_MAX = 1000;

/** Reporting an account (and some of its posts) to the moderators. */
export default function ReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const server = state.status === 'signedIn' ? state.server : '';
  const [account, setAccount] = useState<Account | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [category, setCategory] = useState<ReportCategory>('spam');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!client || !id) return;
    Promise.all([client.account(id), client.accountStatuses(id, { excludeReblogs: true, limit: 20 })])
      .then(([a, statuses]) => {
        setAccount(toAccount(a, server));
        setPosts(statuses.map((s) => toPost(s, server)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Couldn’t load this account.'));
  }, [client, server, id]);

  const toggle = (postId: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });

  const send = async () => {
    if (!client || !account) return;
    setSending(true);
    setError(null);
    try {
      await client.report({ account_id: account.id, status_ids: [...picked], comment: comment.trim(), category, forward: false });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t send the report.');
    } finally {
      setSending(false);
    }
  };

  if (sent && account) {
    return (
      <Pinstripes>
        <ScreenHeader title="Report" />
        <View style={styles.done}>
          <Icon name="check" size={40} color={colors.verified} strokeWidth={3} />
          <Text style={[aquaText.title, styles.center]}>Thanks for telling us</Text>
          <Text style={[aquaText.body, styles.center]}>
            The moderators will look at it. You can also mute or block {account.displayName} from their profile so you don’t see them in the
            meantime.
          </Text>
          <GelButton title="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </View>
      </Pinstripes>
    );
  }

  return (
    <Pinstripes>
      <ScreenHeader
        title="Report"
        back="Cancel"
        right={<GelButton small tone="red" title={sending ? 'Sending…' : 'Send'} disabled={!account || sending || [...comment].length > COMMENT_MAX} onPress={send} />}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FormError message={error} />
        {!account ? (
          error ? null : <ActivityIndicator />
        ) : (
          <>
            <Text style={aquaText.body}>
              Reporting <Text style={styles.bold}>{account.displayName}</Text> {formatHandle(account)}. The report goes to this server’s moderators; they won’t know who sent it.
            </Text>

            <Text style={[aquaText.body, styles.bold]}>What’s wrong?</Text>
            <Segmented options={CATEGORIES} value={category} onChange={setCategory} />
            <Text style={aquaText.handle}>{HINTS[category]}</Text>

            <Text style={[aquaText.body, styles.bold]}>Which posts? (optional)</Text>
            {posts === null ? (
              <ActivityIndicator />
            ) : posts.length === 0 ? (
              <Text style={aquaText.handle}>No recent posts.</Text>
            ) : (
              posts.map((p) => {
                const on = picked.has(p.id);
                return (
                  <Pressable
                    key={p.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={p.content || 'Post with media'}
                    onPress={() => toggle(p.id)}>
                    <Card style={[styles.post, on && styles.postOn]}>
                      <View style={[styles.box, on && styles.boxOn]}>{on ? <Icon name="check" size={14} color="#fff" strokeWidth={3} /> : null}</View>
                      <Text style={[aquaText.body, styles.flex]} numberOfLines={3}>
                        {p.content || (p.media.length ? `[${p.media[0]!.kind === 'video' ? 'Video' : 'Photo'}]` : '')}
                      </Text>
                    </Card>
                  </Pressable>
                );
              })
            )}

            <Text style={[aquaText.body, styles.bold]}>Anything else? (optional)</Text>
            <TextInput
              accessibilityLabel="Details for the moderators"
              placeholder="Details that would help the moderators"
              placeholderTextColor="#767676"
              multiline
              value={comment}
              onChangeText={setComment}
              style={styles.input}
            />
            <Text style={[aquaText.handle, styles.right, [...comment].length > COMMENT_MAX && styles.over]}>
              {[...comment].length} / {COMMENT_MAX}
            </Text>

          </>
        )}
      </ScrollView>
    </Pinstripes>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  bold: { fontWeight: '700' },
  flex: { flex: 1 },
  post: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  postOn: { borderColor: colors.accent, borderWidth: 2 },
  box: { width: 22, height: 22, borderRadius: 4, borderWidth: 1, borderColor: '#8c8c8c', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  input: {
    minHeight: 96,
    fontFamily,
    fontSize: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#8c8c8c',
    borderRadius: 5,
    backgroundColor: '#ffffff',
    textAlignVertical: 'top',
  },
  right: { textAlign: 'right' },
  over: { color: colors.danger, fontWeight: '700' },
  done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 },
  center: { textAlign: 'center' },
});
