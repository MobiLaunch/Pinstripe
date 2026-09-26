import type { Post } from '@pinstripe/core';
import { useLocalSearchParams } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/auth/session';
import { aquaText, GelButton, Pinstripes } from '@/components/aqua';
import { confirm } from '@/components/confirm';
import { FormError } from '@/components/form-error';
import { Spinner } from '@/components/ios6';
import { PostCard } from '@/components/post-card';
import { material } from '@/theme/startup';
import { usePullToRefresh } from '@/components/pull-refresh';
import { ScreenHeader } from '@/components/screen-header';
import { usePostList } from '@/hooks/use-post-list';

/** Everyone's public posts with a hashtag, from this server and ones it knows. */
export default function TagScreen() {
  const { name = '' } = useLocalSearchParams<{ name: string }>();
  const me = useAccount();
  const list = usePostList((client, maxId) => client.tagTimeline(name, { maxId }), `tag:${name}`, {
    accepts: (post) => post.visibility === 'public' && !post.reblog && post.tags.includes(name.toLowerCase()),
  });

  const remove = async (post: Post) => {
    if (await confirm('Delete post?', 'This removes it here and asks other servers to remove it too.', 'Delete')) await list.remove(post);
  };

  const pull = usePullToRefresh(list.refresh, list.refreshing && !list.loading);

  return (
    <Pinstripes>
      <ScreenHeader title={`#${name}`} back="Back" />
      <FlatList
        data={list.posts}
        keyExtractor={(p) => p.id}
        contentContainerStyle={[styles.list, material && styles.listM3]}
        {...pull.listProps}
        ListHeaderComponent={<>{pull.header}</>}
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          list.loading ? (
            <Spinner style={styles.empty} />
          ) : list.error ? (
            <View style={styles.empty}>
              <FormError message={list.error} />
              <GelButton tone="gray" small title="Try Again" onPress={list.refresh} />
            </View>
          ) : (
            <Text style={[aquaText.handle, styles.emptyText]}>No posts with #{name} yet.</Text>
          )
        }
        renderItem={({ item }) => (
          <PostCard post={item} viewerId={me.id} onFavourite={(p) => list.toggle(p, 'favourite')} onBoost={(p) => list.toggle(p, 'boost')} onDelete={remove} />
        )}
      />
    </Pinstripes>
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 12, flexGrow: 1 },
  // Android: timeline rows edge to edge.
  listM3: { padding: 0, gap: 0 },
  empty: { marginTop: 32, gap: 12, alignItems: 'center' },
  emptyText: { textAlign: 'center', marginTop: 32 },
});
