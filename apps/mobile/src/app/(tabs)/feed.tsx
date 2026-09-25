import { POST_MAX_LENGTH, type Post, type Visibility } from '@pinstripe/core';
import { useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type TimelineKind, toMastodonVisibility, toPost } from '@/api/mastodon';
import { useAccount, useAuth } from '@/auth/session';
import { aquaText, Avatar, Card, GelButton, Metal, Pinstripes, Segmented } from '@/components/aqua';
import { confirm } from '@/components/confirm';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { initials } from '@/components/initials';
import { PostCard } from '@/components/post-card';
import { publishPostEvent, usePostList } from '@/hooks/use-post-list';
import { colors, fontFamily } from '@/theme/aqua';

const TIMELINES = [
  { value: 'home', label: 'Home' },
  { value: 'local', label: 'Local' },
  { value: 'federated', label: 'Federated' },
] as const;

const VISIBILITIES: { value: Visibility; label: string }[] = [
  { value: 'public', label: 'Public' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'followers', label: 'Followers only' },
  { value: 'direct', label: 'Mentioned only' },
];

/** Text and photo posts, Mastodon-style, with a composer on top. */
export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const me = useAccount();
  const { refreshAccount } = useAuth();
  const [timeline, setTimeline] = useState<TimelineKind>('home');
  const list = usePostList((client, maxId) => client.timeline(timeline, { maxId }), timeline, {
    // New posts and boosts appear straight away where they belong: Home gets
    // both, Local and Federated only public posts (never boosts).
    accepts: (post) => timeline === 'home' || (post.visibility === 'public' && !post.reblog),
  });

  const remove = async (post: Post) => {
    if (await confirm('Delete post?', 'This removes it here and asks other servers to remove it too.', 'Delete')) {
      if (await list.remove(post)) refreshAccount();
    }
  };

  return (
    <Pinstripes>
      <Metal style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={[aquaText.title, styles.center]} accessibilityRole="header">
          Feed
        </Text>
        <Segmented options={TIMELINES} value={timeline} onChange={setTimeline} />
      </Metal>
      <FlatList
        data={list.posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.refreshing && !list.loading} onRefresh={list.refresh} />}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={<Composer />}
        ListEmptyComponent={
          list.loading ? (
            <ActivityIndicator style={styles.state} />
          ) : list.error ? (
            <View style={styles.state}>
              <FormError message={list.error} />
              <GelButton tone="gray" small title="Try Again" onPress={list.refresh} />
            </View>
          ) : (
            <Text style={[aquaText.handle, styles.empty]}>
              {timeline === 'home' ? 'Nothing here yet. Say hello!' : 'No posts yet.'}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            viewerId={me.id}
            onFavourite={(p) => list.toggle(p, 'favourite')}
            onBoost={(p) => list.toggle(p, 'boost')}
            onDelete={remove}
          />
        )}
      />
    </Pinstripes>
  );
}

function Composer() {
  const me = useAccount();
  const { state, refreshAccount } = useAuth();
  const [draft, setDraft] = useState('');
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = POST_MAX_LENGTH - [...draft].length;
  const current = VISIBILITIES.find((v) => v.value === visibility)!;

  const cycleVisibility = () => {
    const i = VISIBILITIES.findIndex((v) => v.value === visibility);
    setVisibility(VISIBILITIES[(i + 1) % VISIBILITIES.length]!.value);
  };

  const submit = async () => {
    if (state.status !== 'signedIn') return;
    setPosting(true);
    setError(null);
    try {
      const status = await state.client.postStatus({ status: draft.trim(), visibility: toMastodonVisibility(visibility) });
      setDraft('');
      publishPostEvent({ type: 'created', post: toPost(status, state.server) });
      refreshAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t post. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <Card style={styles.composer}>
      <FormError message={error} />
      <View style={styles.row}>
        <Avatar initials={initials(me.displayName)} />
        <TextInput
          accessibilityLabel="New post"
          placeholder="Share an update with your followers…"
          placeholderTextColor="#767676"
          multiline
          value={draft}
          onChangeText={setDraft}
          style={styles.input}
        />
      </View>
      <View style={styles.composerBar}>
        {/* Photo attachments arrive with the media pipeline. */}
        <GelButton tone="gray" small accessibilityLabel="Attach photo" disabled icon={<Icon name="photo" size={18} color={colors.text} />} />
        <GelButton
          tone="gray"
          small
          title={current.label}
          accessibilityLabel={`Visibility: ${current.label}. Tap to change.`}
          onPress={cycleVisibility}
        />
        <Text style={[aquaText.handle, styles.push, remaining < 0 && styles.over]}>{remaining}</Text>
        <GelButton small title={posting ? 'Posting…' : 'Post'} disabled={posting || !draft.trim() || remaining < 0} onPress={submit} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 10, gap: 10, borderBottomWidth: 1 },
  center: { textAlign: 'center' },
  list: { padding: 12, gap: 12, flexGrow: 1 },
  composer: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    minHeight: 76,
    fontFamily,
    fontSize: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#8c8c8c',
    borderRadius: 5,
    backgroundColor: '#ffffff',
    textAlignVertical: 'top',
  },
  composerBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 50 },
  push: { marginLeft: 'auto' },
  over: { color: colors.danger, fontWeight: '700' },
  state: { marginTop: 32, gap: 12, alignItems: 'center' },
  empty: { textAlign: 'center', marginTop: 32 },
});
