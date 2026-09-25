import { type AccountSettings, DEFAULT_SETTINGS, type Theme } from '@pinstripe/core';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useAccount, useAuth, useSource } from '@/auth/session';
import { AquaSwitch, aquaText, GelButton, Group, Pinstripes, Segmented } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { ScreenHeader } from '@/components/screen-header';
import { colors, fontFamily } from '@/theme/aqua';
import { useAccent, useSetTheme } from '@/theme/theme';

type Toggle = { [K in keyof AccountSettings]: AccountSettings[K] extends boolean ? K : never }[keyof AccountSettings];

const THEMES = [
  { value: 'blue', label: 'Blue' },
  { value: 'graphite', label: 'Graphite' },
] as const;

// Which API saves each switch: Mastodon's profile (both servers) or Pinstripe's own preferences.
const PROFILE_KEYS = { approveFollowers: 'locked', listInDirectory: 'discoverable' } as const;
const PREFERENCE_KEYS = {
  allowVideoDownloads: 'allow_video_downloads',
  hideFollowerCounts: 'hide_follower_counts',
  autoplayVideos: 'autoplay_videos',
  startMuted: 'start_muted',
  saveDataOnCellular: 'save_data_on_cellular',
} as const;

export default function SettingsScreen() {
  const me = useAccount();
  const source = useSource();
  const { state, signOut, applyCredentials } = useAuth();
  const accent = useAccent();
  const setTheme = useSetTheme();
  const [settings, setSettings] = useState<AccountSettings>({
    ...DEFAULT_SETTINGS,
    theme: accent.theme,
    approveFollowers: me.locked,
    listInDirectory: me.discoverable,
    defaultVisibility: source.defaultVisibility,
  });
  // Pinstripe-only settings; null while loading, false on servers that don't have them.
  const [preferencesAvailable, setPreferencesAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = state.status === 'signedIn' ? state.client : null;

  useEffect(() => {
    if (!client) return;
    client
      .preferences()
      .then((p) => {
        setSettings((s) => ({
          ...s,
          allowVideoDownloads: p.allow_video_downloads,
          hideFollowerCounts: p.hide_follower_counts,
          autoplayVideos: p.autoplay_videos,
          startMuted: p.start_muted,
          saveDataOnCellular: p.save_data_on_cellular,
          theme: p.theme,
        }));
        setPreferencesAvailable(true);
      })
      .catch(() => setPreferencesAvailable(false));
  }, [client]);

  /** Saves one change right away; puts the old value back if the server refuses. */
  const change = async <K extends keyof AccountSettings>(key: K, value: AccountSettings[K]) => {
    if (!client) return;
    const before = settings[key];
    setSettings((s) => ({ ...s, [key]: value }));
    setError(null);
    try {
      if (key in PROFILE_KEYS) {
        await applyCredentials(await client.updateCredentials({ [PROFILE_KEYS[key as keyof typeof PROFILE_KEYS]]: value }));
      } else if (key in PREFERENCE_KEYS) {
        await client.updatePreferences({ [PREFERENCE_KEYS[key as keyof typeof PREFERENCE_KEYS]]: value });
      } else if (key === 'theme') {
        // The look changes on this device either way; Pinstripe servers also remember it.
        setTheme(value as Theme);
        if (preferencesAvailable) await client.updatePreferences({ theme: value as Theme });
      }
    } catch (e) {
      setSettings((s) => ({ ...s, [key]: before }));
      setError(e instanceof Error ? e.message : 'Couldn’t save that setting.');
    }
  };

  const row = (key: Toggle, title: string, sub?: string) => {
    const unavailable = key in PREFERENCE_KEYS && preferencesAvailable !== true;
    return (
      <View style={styles.row} key={key}>
        <View style={styles.flex}>
          <Text style={[aquaText.body, unavailable && styles.muted]}>{title}</Text>
          {sub ? <Text style={aquaText.handle}>{sub}</Text> : null}
        </View>
        <AquaSwitch
          value={settings[key]}
          onValueChange={(v) => change(key, v)}
          disabled={unavailable}
          accessibilityLabel={title}
        />
      </View>
    );
  };

  return (
    <Pinstripes>
      <ScreenHeader title="Settings" back="Account" />
      <ScrollView contentContainerStyle={styles.content}>
        <FormError message={error} />
        {preferencesAvailable === false ? (
          <Text style={[aquaText.handle, styles.note]}>
            Some settings are Pinstripe features your server doesn’t have, so they’re turned off here.
          </Text>
        ) : null}
        <Group title="Account">
          <Link href="/edit-profile" asChild>
            <NavRow title="Edit profile" sub="Photo, banner, bio and profile fields" />
          </Link>
          <Link href="/email-password" asChild>
            <NavRow title="Email & password" divider />
          </Link>
          {settings.approveFollowers || source.followRequests > 0 ? (
            <Link href="/follow-requests" asChild>
              <NavRow
                title="Follow requests"
                sub={source.followRequests ? `${source.followRequests} waiting` : 'None waiting'}
                divider
              />
            </Link>
          ) : null}
        </Group>
        <Group title="Privacy">
          {row('approveFollowers', 'Approve new followers', 'People must request to follow you')}
          {row('listInDirectory', 'List me in the server directory', 'Helps people on other servers find you')}
          {row('allowVideoDownloads', 'Allow video downloads', 'Others can save your videos')}
          {row('hideFollowerCounts', 'Hide follower counts')}
          <Link href={{ pathname: '/blocked-accounts', params: { kind: 'mutes' } }} asChild>
            <NavRow title="Muted accounts" divider />
          </Link>
          <Link href={{ pathname: '/blocked-accounts', params: { kind: 'blocks' } }} asChild>
            <NavRow title="Blocked accounts" divider />
          </Link>
        </Group>
        <Group title="Federation">
          <Link href="/blocked-servers" asChild>
            <NavRow title="Blocked servers" sub="Hide everything from domains you choose" />
          </Link>
        </Group>
        {source.moderator ? (
          <Group title="Moderation">
            <Link href="/moderation" asChild>
              <NavRow title="Moderation" sub="Reports, blocked servers and the log" />
            </Link>
          </Group>
        ) : null}
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
              onChange={(theme) => change('theme', theme)}
              style={styles.flex}
            />
          </View>
        </Group>
        <GelButton tone="red" title="Sign Out" style={styles.signOut} onPress={signOut} />
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
  muted: { color: '#8a8a8a' },
  note: { marginBottom: 4, paddingHorizontal: 6 },
  footer: { fontFamily, textAlign: 'center', marginTop: 16 },
});
