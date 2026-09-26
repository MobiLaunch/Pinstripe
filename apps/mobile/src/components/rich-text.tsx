import type { Post } from '@pinstripe/core';
import { router } from 'expo-router';
import { Fragment, type ReactNode } from 'react';
import { type StyleProp, StyleSheet, Text, type TextStyle } from 'react-native';

import { useAccent } from '@/theme/theme';

// #hashtags and @user or @user@server, the way servers write them.
const TOKEN = /(#[\p{L}\p{N}_]+|@[A-Za-z0-9_]+(?:@[A-Za-z0-9.-]+(?::\d+)?)?)/gu;

/**
 * A post's text with its hashtags and mentions tappable: a tag opens its
 * timeline, a mention opens the profile (when the post says who it is).
 */
export function RichText({
  post,
  style,
  linkStyle,
  numberOfLines,
  selectable,
}: {
  post: Pick<Post, 'content' | 'mentions'>;
  style?: StyleProp<TextStyle>;
  linkStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
}) {
  const accent = useAccent();
  const link = [styles.link, { color: accent.colorActive }, linkStyle];
  const parts: ReactNode[] = post.content.split(TOKEN).map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
    if (part.startsWith('#')) {
      const tag = part.slice(1);
      return (
        <Text key={i} style={link} accessibilityRole="link" onPress={() => router.push({ pathname: '/tag/[name]', params: { name: tag.toLowerCase() } })}>
          {part}
        </Text>
      );
    }
    const [username, domain] = part.slice(1).split('@');
    const who = post.mentions.find((m) => m.username.toLowerCase() === username!.toLowerCase() && (!domain || m.domain.toLowerCase() === domain.toLowerCase()));
    return who ? (
      <Text key={i} style={link} accessibilityRole="link" onPress={() => router.push(`/profile/${who.id}`)}>
        {part}
      </Text>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    );
  });
  return (
    <Text style={style} numberOfLines={numberOfLines} selectable={selectable}>
      {parts}
    </Text>
  );
}

const styles = StyleSheet.create({
  link: { fontWeight: '700' },
});
