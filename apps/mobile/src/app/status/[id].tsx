import { POST_MAX_LENGTH, type Post } from '@pinstripe/core';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type MastodonClient, toMastodonVisibility, toPost } from '@/api/mastodon';
import { useAccount, useAuth } from '@/auth/session';
import { Pinstripes } from '@/components/aqua';
import { BarButton, Spinner, Toolbar } from '@/components/ios6';
import { confirm } from '@/components/confirm';
import { FormError } from '@/components/form-error';
import { PostCard } from '@/components/post-card';
import { ScreenHeader } from '@/components/screen-header';
import { publishPostEvent, usePostList } from '@/hooks/use-post-list';
import { colors, fontFamily } from '@/theme/aqua';

/** The whole thread, oldest first; a thread has no further pages. */
async function loadThread(client: MastodonClient, id: string, maxId?: string) {
  if (maxId) return [];
  const [status, context] = await Promise.all([client.status(id), client.context(id)]);
  return [...context.ancestors, status, ...context.descendants];
}

/** A post with the posts it replies to above it, its replies below, and a reply box. */
export default function ThreadScreen() {
  const { id, reply } = useLocalSearchParams<{ id: string; reply?: string }>();
  const me = useAccount();
  const list = usePostList((client, maxId) => loadThread(client, id, maxId), `thread:${id}`);
  const focused = list.posts.find((p) => p.id === id);

  const remove = async (post: Post) => {
    if (await confirm('Delete post?', 'This removes it here and asks other servers to remove it too.', 'Delete')) {
      await list.remove(post);
    }
  };

  return (
    <Pinstripes>
      <ScreenHeader title="Thread" back="Back" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          data={list.posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            list.loading ? (
              <Spinner style={styles.state} />
            ) : (
              <View style={styles.state}>
                <FormError message={list.error ?? 'This post isn’t available.'} />
              </View>
            )
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              viewerId={me.id}
              focused={item.id === id}
              onFavourite={(p) => list.toggle(p, 'favourite')}
              onBoost={(p) => list.toggle(p, 'boost')}
              onDelete={remove}
            />
          )}
        />
        {focused ? <ReplyBox to={focused} autoFocus={reply === '1'} onPosted={list.refresh} /> : null}
      </KeyboardAvoidingView>
    </Pinstripes>
  );
}

function ReplyBox({ to, autoFocus, onPosted }: { to: Post; autoFocus: boolean; onPosted: () => void }) {
  const insets = useSafeAreaInsets();
  const me = useAccount();
  const { state, refreshAccount } = useAuth();
  // Mention the author and everyone they mentioned, except yourself, as Mastodon does.
  const handles = [to.account, ...to.mentions].filter((a) => a.id !== me.id).map((a) => `@${a.username}@${a.domain}`);
  const [draft, setDraft] = useState(() => (handles.length ? `${[...new Set(handles)].join(' ')} ` : ''));
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = POST_MAX_LENGTH - [...draft].length;

  const submit = async () => {
    if (state.status !== 'signedIn') return;
    setPosting(true);
    setError(null);
    try {
      const status = await state.client.postStatus({
        status: draft.trim(),
        in_reply_to_id: to.id,
        // A reply is never more public than the post it answers.
        visibility: toMastodonVisibility(to.visibility),
        spoiler_text: to.spoiler || undefined,
      });
      setDraft(handles.length ? `${[...new Set(handles)].join(' ')} ` : '');
      publishPostEvent({ type: 'created', post: toPost(status, state.server) });
      onPosted();
      refreshAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t send your reply.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <Toolbar style={[styles.replyBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <FormError message={error} />
      <Text style={styles.replying}>Replying to {to.account.displayName}</Text>
      <View style={styles.replyRow}>
        <TextInput
          accessibilityLabel="Write a reply"
          placeholder="Write a reply…"
          placeholderTextColor="#9a9a9a"
          multiline
          autoFocus={autoFocus}
          value={draft}
          onChangeText={setDraft}
          style={styles.input}
        />
        <BarButton done title={posting ? '…' : 'Reply'} disabled={posting || !draft.trim() || remaining < 0} onPress={submit} style={styles.send} />
      </View>
      {remaining < 50 ? <Text style={[styles.replying, styles.count, remaining < 0 && styles.over]}>{remaining}</Text> : null}
    </Toolbar>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 12, gap: 12, flexGrow: 1 },
  state: { marginTop: 32, alignItems: 'center' },
  replyBar: { gap: 6 },
  replying: {
    fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 4,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: -1 },
    textShadowRadius: 0,
  },
  replyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  // The Messages-style rounded field, pressed into the bar.
  input: {
    flex: 1,
    minHeight: 34,
    maxHeight: 120,
    fontFamily,
    fontSize: 15,
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 7,
    borderWidth: 1,
    borderColor: '#58677d',
    borderRadius: 17,
    backgroundColor: '#ffffff',
    boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.3), 0 1px 0 rgba(255,255,255,0.35)',
  },
  send: { height: 34 },
  count: { textAlign: 'right' },
  over: { color: colors.danger, fontWeight: '700' },
});
