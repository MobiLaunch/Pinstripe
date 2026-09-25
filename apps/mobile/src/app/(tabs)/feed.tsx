import { POST_MAX_LENGTH, type Post, type Visibility } from '@pinstripe/core';
import { Link } from 'expo-router';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import { type MastodonMedia, type TimelineKind, toMastodonVisibility, toPost } from '@/api/mastodon';
import { checkPicked, uploadMedia } from '@/api/upload';
import { useAccount, useAuth, useSource } from '@/auth/session';
import { aquaText, Avatar, Card, GelButton, Pinstripes, Segmented } from '@/components/aqua';
import { Badge, BarButton, NavBar } from '@/components/ios6';
import { confirm } from '@/components/confirm';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { initials } from '@/components/initials';
import { PostCard } from '@/components/post-card';
import { ProgressBar } from '@/components/progress-bar';
import { publishPostEvent, usePostList } from '@/hooks/use-post-list';
import { useUnreadNotifications } from '@/hooks/use-unread-notifications';
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
      <NavBar
        title="Feed"
        left={<NotificationsButton />}
        right={
          <Link href="/search" asChild>
            <BarButton accessibilityLabel="Find people" icon={<Icon name="search" size={16} strokeWidth={2.6} color="#fff" />} />
          </Link>
        }>
        <Segmented variant="bar" options={TIMELINES} value={timeline} onChange={setTimeline} />
      </NavBar>
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

/** The bell, with a count of unread notifications. */
function NotificationsButton() {
  const unread = useUnreadNotifications();
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <View style={styles.bell}>
      <Link href="/notifications" asChild>
        <BarButton accessibilityLabel={label} icon={<Icon name="bell" size={16} strokeWidth={2.6} color="#fff" />} />
      </Link>
      <Badge count={unread} style={styles.unread} />
    </View>
  );
}

/** A photo being attached: uploading until `media` is set. */
interface Attachment {
  key: string;
  uri: string;
  progress: number;
  media?: MastodonMedia;
}

function Composer() {
  const me = useAccount();
  const { state, refreshAccount } = useAuth();
  const [draft, setDraft] = useState('');
  const source = useSource();
  const [visibility, setVisibility] = useState<Visibility>(source.defaultVisibility);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const remaining = POST_MAX_LENGTH - [...draft].length;
  const current = VISIBILITIES.find((v) => v.value === visibility)!;
  const uploading = attachments.some((a) => !a.media);
  const ready = attachments.filter((a) => a.media);

  const pickPhotos = async () => {
    if (state.status !== 'signedIn') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 4 - attachments.length,
      // JPEG rather than HEIC, so every server can show it.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.9,
    });
    if (result.canceled) return;
    setError(null);
    for (const asset of result.assets.slice(0, 4 - attachments.length)) {
      const problem = checkPicked(asset);
      if (problem) {
        setError(problem);
        continue;
      }
      const key = `${asset.uri}-${Date.now()}`;
      setAttachments((list) => [...list, { key, uri: asset.uri, progress: 0 }]);
      const update = (patch: Partial<Attachment>) => setAttachments((list) => list.map((a) => (a.key === key ? { ...a, ...patch } : a)));
      uploadMedia(state.client, state.token, asset, { onProgress: (progress) => update({ progress }) })
        .then((media) => update({ media, progress: 1 }))
        .catch((e) => {
          setAttachments((list) => list.filter((a) => a.key !== key));
          setError(e instanceof Error ? e.message : 'Couldn’t upload that photo.');
        });
    }
  };

  const cycleVisibility = () => {
    const i = VISIBILITIES.findIndex((v) => v.value === visibility);
    setVisibility(VISIBILITIES[(i + 1) % VISIBILITIES.length]!.value);
  };

  const submit = async () => {
    if (state.status !== 'signedIn') return;
    setPosting(true);
    setError(null);
    try {
      const status = await state.client.postStatus({
        status: draft.trim(),
        visibility: toMastodonVisibility(visibility),
        media_ids: ready.map((a) => a.media!.id),
      });
      setDraft('');
      setAttachments([]);
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
      {attachments.length ? (
        <View style={styles.attachments}>
          {attachments.map((a) => (
            <View key={a.key} style={styles.thumbWrap}>
              <Image source={{ uri: a.uri }} style={styles.thumb} contentFit="cover" accessibilityLabel="Attached photo" />
              {a.media ? null : (
                <View style={styles.thumbProgress}>
                  <ProgressBar progress={a.progress} label="Uploading photo" />
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                hitSlop={10}
                onPress={() => setAttachments((list) => list.filter((x) => x.key !== a.key))}
                style={styles.remove}>
                <Text style={styles.removeText}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.composerBar}>
        <GelButton
          tone="gray"
          small
          accessibilityLabel="Attach photos"
          disabled={attachments.length >= 4}
          onPress={pickPhotos}
          icon={<Icon name="photo" size={18} color={colors.text} />}
        />
        <GelButton
          tone="gray"
          small
          title={current.label}
          accessibilityLabel={`Visibility: ${current.label}. Tap to change.`}
          onPress={cycleVisibility}
        />
        <Text style={[aquaText.handle, styles.push, remaining < 0 && styles.over]}>{remaining}</Text>
        <GelButton
          small
          title={posting ? 'Posting…' : 'Post'}
          disabled={posting || uploading || (!draft.trim() && !ready.length) || remaining < 0}
          onPress={submit}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  bell: { alignSelf: 'flex-start' },
  unread: { position: 'absolute', top: -9, right: -12 },
  list: { padding: 12, gap: 12, flexGrow: 1 },
  composer: { gap: 10 },
  attachments: { flexDirection: 'row', gap: 8, paddingLeft: 50, flexWrap: 'wrap' },
  thumbWrap: { width: 72, height: 72, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#8f8f8f' },
  thumb: { width: '100%', height: '100%' },
  thumbProgress: { position: 'absolute', left: 4, right: 4, bottom: 4 },
  remove: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 16, lineHeight: 18, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10 },
  input: {
    flex: 1,
    minHeight: 76,
    fontFamily,
    fontSize: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#a2a2a2',
    borderTopColor: '#7b7b7b',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    boxShadow: 'inset 0 2px 3px rgba(0,0,0,0.22), 0 1px 0 rgba(255,255,255,0.8)',
    textAlignVertical: 'top',
  },
  composerBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 50 },
  push: { marginLeft: 'auto' },
  over: { color: colors.danger, fontWeight: '700' },
  state: { marginTop: 32, gap: 12, alignItems: 'center' },
  empty: { textAlign: 'center', marginTop: 32 },
});
