import { formatHandle, type Post } from '@pinstripe/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { aquaText, Avatar, Card, GelButton } from '@/components/aqua';
import { Icon, type IconName } from '@/components/icon';
import { initials } from '@/components/initials';
import { MediaGrid } from '@/components/media-grid';
import { relativeTime } from '@/components/relative-time';
import { fontFamily } from '@/theme/aqua';
import { RichText } from '@/components/rich-text';
import { useInk } from '@/theme/theme';

export interface PostCardProps {
  post: Post;
  /** The signed-in account's id, to offer Delete on their own posts. */
  viewerId: string;
  onFavourite: (post: Post) => void;
  onBoost: (post: Post) => void;
  onDelete: (post: Post) => void;
  /** The post being viewed in a thread: highlighted, and not a link to itself. */
  focused?: boolean;
}

/** A post in the Feed and on profiles. Boosts show the original with a "Boosted by" line. */
export function PostCard({ post, viewerId, onFavourite, onBoost, onDelete, focused = false }: PostCardProps) {
  const shown = post.reblog ?? post;
  const [revealed, setRevealed] = useState(false);
  const favourited = !!shown.viewer?.favourited;
  const boosted = !!shown.viewer?.boosted;
  const boostable = shown.visibility === 'public' || shown.visibility === 'unlisted';
  const mine = shown.account.id === viewerId && !post.reblog;
  const openProfile = () => router.push(`/profile/${shown.account.id}`);
  const openThread = () => router.push(`/status/${shown.id}`);
  const ink = useInk();

  return (
    <Card style={focused ? styles.focused : undefined}>
      {post.reblog ? (
        <View style={styles.boostedBy}>
          <Icon name="boost" size={14} color={ink.muted} />
          <Text style={aquaText.handle}>Boosted by {post.account.displayName}</Text>
        </View>
      ) : null}
      <View style={styles.row}>
        <Pressable accessibilityRole="link" accessibilityLabel={`${shown.account.displayName}'s profile`} onPress={openProfile}>
          <Avatar initials={initials(shown.account.displayName)} uri={shown.account.avatarUrl} />
        </Pressable>
        <View style={styles.flex}>
          <View style={styles.meta}>
            <Pressable accessibilityRole="link" onPress={openProfile} style={styles.author}>
              <Text style={[aquaText.body, styles.bold]}>{shown.account.displayName}</Text>
              <Text style={[aquaText.handle, styles.shrink]} numberOfLines={1}>
                {formatHandle(shown.account)}
              </Text>
            </Pressable>
            <View style={styles.push}>
              {shown.visibility === 'followers' || shown.visibility === 'direct' ? (
                <Icon name="lock" size={12} color={ink.muted} />
              ) : null}
              <Text style={aquaText.handle}>{relativeTime(shown.createdAt)}</Text>
            </View>
          </View>

          {shown.spoiler ? (
            <View style={styles.spoiler}>
              <Text style={[aquaText.body, styles.bold]}>{shown.spoiler}</Text>
              <GelButton tone="gray" small title={revealed ? 'Show less' : 'Show more'} onPress={() => setRevealed(!revealed)} />
            </View>
          ) : null}
          {!shown.spoiler || revealed ? (
            <Pressable onPress={focused ? undefined : openThread} disabled={focused} accessibilityHint={focused ? undefined : 'Opens the thread'}>
              <RichText post={shown} style={[aquaText.body, styles.content, focused && styles.focusedText]} selectable={focused} />
            </Pressable>
          ) : null}

          <MediaGrid media={shown.media} />

          <View style={styles.actions}>
            <Action
              icon="reply"
              label="Reply"
              count={shown.counts.replies}
              onPress={() => router.push(`/status/${shown.id}?reply=1`)}
            />
            <Action
              icon="boost"
              label={boosted ? 'Undo boost' : 'Boost'}
              count={shown.counts.boosts}
              on={boosted}
              disabled={!boostable}
              onPress={() => onBoost(post)}
            />
            <Action
              icon="heart"
              label={favourited ? 'Unfavorite' : 'Favorite'}
              count={shown.counts.favourites}
              on={favourited}
              filled
              onPress={() => onFavourite(post)}
            />
            {mine ? <Action icon="trash" label="Delete" onPress={() => onDelete(post)} /> : null}
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
  filled = false,
  disabled = false,
  onPress,
}: {
  icon: IconName;
  label: string;
  count?: number;
  on?: boolean;
  filled?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  const ink = useInk();
  const color = disabled ? '#b0b0b0' : on ? '#0e59c4' : ink.subtle;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={styles.action}>
      <Icon name={icon} size={18} color={color} filled={filled && on} />
      {count !== undefined ? <Text style={[styles.actionText, { color }]}>{count}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  boostedBy: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, marginLeft: 50 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  meta: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  author: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 },
  focused: { borderColor: '#3a7fd8', borderWidth: 2 },
  focusedText: { fontSize: 16, lineHeight: 23 },
  shrink: { flexShrink: 1 },
  push: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 },
  bold: { fontWeight: '700' },
  content: { marginTop: 4 },
  spoiler: { marginTop: 4, gap: 6, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', gap: 4, marginTop: 6, marginLeft: -8 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, minWidth: 44, paddingHorizontal: 8 },
  actionText: { fontFamily, fontSize: 12 },
});
