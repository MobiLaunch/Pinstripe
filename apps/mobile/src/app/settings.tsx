import { type AccountSettings, DEFAULT_SETTINGS, type Theme } from '@pinstripe/core';
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, type ViewStyle } from 'react-native';

import { aquaText, GelButton, Group, Pinstripes, Segmented } from '@/components/aqua';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { colors, fontFamily } from '@/theme/aqua';

type Toggle = { [K in keyof AccountSettings]: AccountSettings[K] extends boolean ? K : never }[keyof AccountSettings];

const THEMES = [
  { value: 'blue', label: 'Blue' },
  { value: 'graphite', label: 'Graphite' },
] as const;

export default function SettingsScreen() {
  // Local until the settings endpoint exists.
  const [settings, setSettings] = useState<AccountSettings>(DEFAULT_SETTINGS);
  const toggle = (key: Toggle) => (value: boolean) => setSettings((s) => ({ ...s, [key]: value }));

  const row = (key: Toggle, title: string, sub?: string) => (
    <View style={styles.row} key={key}>
      <View style={styles.flex}>
        <Text style={aquaText.body}>{title}</Text>
        {sub ? <Text style={aquaText.handle}>{sub}</Text> : null}
      </View>
      <Switch value={settings[key]} onValueChange={toggle(key)} accessibilityLabel={title} trackColor={{ true: colors.accent }} thumbColor="#ffffff" />
    </View>
  );

  return (
    <Pinstripes>
      <ScreenHeader title="Settings" back="Account" />
      <ScrollView contentContainerStyle={styles.content}>
        <Group title="Account">
          <Link href="/edit-profile" asChild>
            <NavRow title="Edit profile" sub="Photo, banner, bio and profile fields" />
          </Link>
          <NavRow title="Email & password" divider />
        </Group>
        <Group title="Privacy">
          {row('approveFollowers', 'Approve new followers', 'People must request to follow you')}
          {row('listInDirectory', 'List me in the server directory', 'Helps people on other servers find you')}
          {row('allowVideoDownloads', 'Allow video downloads', 'Others can save your videos')}
          {row('hideFollowerCounts', 'Hide follower counts')}
        </Group>
        <Group title="Federation">
          <NavRow title="Blocked servers" sub="Hide everything from domains you choose" />
        </Group>
        <Group title="Playback">
          {row('autoplayVideos', 'Autoplay videos')}
          {row('startMuted', 'Start videos muted')}
          {row('saveDataOnCellular', 'Save data on cellular')}
        </Group>
        <Group title="Appearance">
          <View style={styles.row}>
            <Segmented<Theme>
              options={THEMES}
              value={settings.theme}
              onChange={(theme) => setSettings((s) => ({ ...s, theme }))}
              style={styles.flex}
            />
          </View>
        </Group>
        <GelButton tone="red" title="Sign Out" style={styles.signOut} onPress={() => router.replace('/sign-in')} />
        <Text style={[aquaText.handle, styles.footer]}>Pinstripe · ActivityPub</Text>
      </ScrollView>
    </Pinstripes>
  );
}

function NavRow({
  title,
  sub,
  divider,
  style,
  ...rest
}: {
  title: string;
  sub?: string;
  divider?: boolean;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" {...rest} style={[styles.row, divider && styles.divider, style]}>
      <View style={styles.flex}>
        <Text style={aquaText.body}>{title}</Text>
        {sub ? <Text style={aquaText.handle}>{sub}</Text> : null}
      </View>
      <Icon name="chevronRight" size={16} color="#777" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  flex: { flex: 1 },
  signOut: { marginTop: 24 },
  footer: { fontFamily, textAlign: 'center', marginTop: 16 },
});
