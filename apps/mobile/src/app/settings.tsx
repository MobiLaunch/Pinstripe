import { type AccountSettings, DEFAULT_SETTINGS, type Theme } from '@pinstripe/core';
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAccount, useAuth, useSource } from '@/auth/session';
import { AquaSwitch, GelButton } from '@/components/aqua';
import { confirm } from '@/components/confirm';
import { FormError } from '@/components/form-error';
import { TableBackground, TableGroup, TableRow } from '@/components/ios6';
import { ScreenHeader } from '@/components/screen-header';
import { fontFamily } from '@/theme/aqua';
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
      <TableRow
        key={key}
        title={title}
        sub={unavailable ? 'Not available on your server' : sub}
        right={<AquaSwitch value={settings[key]} onValueChange={(v) => change(key, v)} disabled={unavailable} accessibilityLabel={title} />}
      />
    );
  };

  const confirmSignOut = async () => {
    if (await confirm('Sign Out?', 'You can sign back in any time.', 'Sign Out')) signOut();
  };

  return (
    <TableBackground>
      <ScreenHeader title="Settings" back="Account" />
      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <View style={styles.pad}>
            <FormError message={error} />
          </View>
        ) : null}
        <TableGroup title="Account">
          <Link href="/edit-profile" asChild>
            <TableRow title="Edit Profile" sub="Photo, banner, bio and profile fields" accessory="chevron" />
          </Link>
          <Link href="/email-password" asChild>
            <TableRow title="Email & Password" accessory="chevron" />
          </Link>
          {settings.approveFollowers || source.followRequests > 0 ? (
            <Link href="/follow-requests" asChild>
              <TableRow title="Follow Requests" detail={String(source.followRequests)} accessory="chevron" />
            </Link>
          ) : null}
        </TableGroup>
        <TableGroup title="Privacy">
          {row('approveFollowers', 'Approve Followers', 'People must request to follow you')}
          {row('listInDirectory', 'Server Directory', 'Helps people on other servers find you')}
          {row('allowVideoDownloads', 'Video Downloads', 'Others can save your videos')}
          {row('hideFollowerCounts', 'Hide Follower Counts')}
          <Link href={{ pathname: '/blocked-accounts', params: { kind: 'mutes' } }} asChild>
            <TableRow title="Muted Accounts" accessory="chevron" />
          </Link>
          <Link href={{ pathname: '/blocked-accounts', params: { kind: 'blocks' } }} asChild>
            <TableRow title="Blocked Accounts" accessory="chevron" />
          </Link>
        </TableGroup>
        <TableGroup title="Federation" footer="Blocked servers are hidden from you completely: their posts, replies and notifications.">
          <Link href="/blocked-servers" asChild>
            <TableRow title="Blocked Servers" accessory="chevron" />
          </Link>
        </TableGroup>
        {source.moderator ? (
          <TableGroup title="Moderation">
            <Link href="/moderation" asChild>
              <TableRow title="Moderation" sub="Reports, blocked servers and the log" accessory="chevron" />
            </Link>
          </TableGroup>
        ) : null}
        <TableGroup title="Playback">
          {row('autoplayVideos', 'Autoplay')}
          {row('startMuted', 'Start Muted')}
          {row('saveDataOnCellular', 'Save Data on Cellular')}
        </TableGroup>
        <TableGroup title="Appearance">
          {THEMES.map((t) => (
            <TableRow
              key={t.value}
              title={t.label}
              accessibilityRole="radio"
              accessibilityState={{ selected: settings.theme === t.value }}
              accessory={settings.theme === t.value ? 'check' : 'none'}
              onPress={() => change('theme', t.value)}
            />
          ))}
        </TableGroup>
        {preferencesAvailable === false ? (
          <Text style={styles.footer}>Some settings are Pinstripe features your server doesn’t have, so they’re turned off here.</Text>
        ) : null}
        <View style={styles.pad}>
          <GelButton tone="red" rect title="Sign Out" style={styles.signOut} onPress={confirmSignOut} />
        </View>
        <Text style={styles.footer}>Pinstripe · ActivityPub</Text>
      </ScrollView>
    </TableBackground>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  pad: { marginHorizontal: 10, marginTop: 14 },
  signOut: { marginTop: 12 },
  footer: {
    fontFamily,
    fontSize: 14,
    color: '#4c566c',
    textAlign: 'center',
    marginTop: 14,
    marginHorizontal: 20,
    textShadowColor: '#ffffff',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
});
