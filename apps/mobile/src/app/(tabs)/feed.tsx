import { formatHandle, POST_MAX_LENGTH, type Post, type Timeline } from '@pinstripe/core';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '@/auth/session';
import { aquaText, Avatar, Card, GelButton, Metal, Pinstripes, Segmented } from '@/components/aqua';
import { Icon } from '@/components/icon';
import { initials } from '@/components/initials';
import { feed } from '@/data/fixtures';
import { colors, fontFamily } from '@/theme/aqua';

const TIMELINES = [
  { value: 'home', label: 'Home' },
  { value: 'local', label: 'Local' },
  { value: 'federated', label: 'Federated' },
] as const;

/** Text and photo posts, Mastodon-style, with a composer on top. */
export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const [timeline, setTimeline] = useState<Timeline>('home');
  const [draft, setDraft] = useState('');
  const me = useAccount();

  return (
    <Pinstripes>
      <Metal style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={[aquaText.title, styles.center]} accessibilityRole="header">Feed</Text>
        <Segmented options={TIMELINES} value={timeline} onChange={setTimeline} />
      </Metal>
      <FlatList
        data={feed}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Card style={styles.composer}>
            <View style={styles.row}>
              <Avatar initials={initials(me.displayName)} />
              <TextInput
                accessibilityLabel="New post"
                placeholder="Share an update with your followers…"
                placeholderTextColor="#767676"
                multiline
                maxLength={POST_MAX_LENGTH}
                value={draft}
                onChangeText={setDraft}
                style={styles.input}
              />
            </View>
            <View style={styles.composerBar}>
              <GelButton tone="gray" small accessibilityLabel="Attach photo" icon={<Icon name="photo" size={18} color={colors.text} />} />
              <Text style={[aquaText.handle, styles.push]}>{POST_MAX_LENGTH - draft.length}</Text>
              <GelButton small title="Post" disabled={!draft.trim()} />
            </View>
          </Card>
        }
        renderItem={({ item }) => <PostCard post={item} />}
      />
    </Pinstripes>
  );
}

function PostCard({ post }: { post: Post }) {
  const [fav, setFav] = useState(post.viewer?.favourited ?? false);
  return (
    <Card>
      <View style={styles.row}>
        <Avatar initials={initials(post.account.displayName)} />
        <View style={styles.flex}>
          <View style={styles.meta}>
            <Text style={[aquaText.body, styles.bold]}>{post.account.displayName}</Text>
            <Text style={aquaText.handle} numberOfLines={1}>{formatHandle(post.account)}</Text>
          </View>
          <Text style={[aquaText.body, styles.content]}>{post.content}</Text>
          {post.media[0]?.kind === 'image' ? (
            <View style={styles.photo} accessibilityLabel={post.media[0].description}>
              <Icon name="photo" color="#0b2f60" />
            </View>
          ) : null}
          <View style={styles.actions}>
            <Action icon="reply" label="Reply" count={post.counts.replies} />
            <Action icon="boost" label="Boost" count={post.counts.boosts} />
            <Action
              icon="heart"
              label="Favorite"
              count={post.counts.favourites + (fav ? 1 : 0)}
              on={fav}
              onPress={() => setFav(!fav)}
            />
          </View>
        </View>
      </View>
    </Card>
  );
}

function Action({
  icon,
  label,
  count,
  on = false,
  onPress,
}: {
  icon: 'reply' | 'boost' | 'heart';
  label: string;
  count: number;
  on?: boolean;
  onPress?: () => void;
}) {
  const color = on ? '#0e59c4' : colors.textSubtle;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={styles.action}>
      <Icon name={icon} size={18} color={color} filled={on} />
      <Text style={[styles.actionText, { color }]}>{count}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 10, gap: 10, borderBottomWidth: 1 },
  center: { textAlign: 'center' },
  list: { padding: 12, gap: 12 },
  composer: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  input: {
    flex: 1,
    minHeight: 76,
    fontFamily,
    fontSize: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#8c8c8c',
    borderRadius: 5,
    textAlignVertical: 'top',
  },
  composerBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 50 },
  push: { marginLeft: 'auto' },
  meta: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  bold: { fontWeight: '700' },
  content: { marginTop: 4 },
  photo: {
    marginTop: 10,
    height: 170,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#8f8f8f',
    backgroundColor: '#8fc0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: 4, marginTop: 6, marginLeft: -8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 8 },
  actionText: { fontFamily, fontSize: 12 },
});
