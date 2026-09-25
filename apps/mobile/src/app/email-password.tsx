import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { GelButton, TableField } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { TableBackground, TableGroup, TableRow } from '@/components/ios6';
import { PASSWORD_MIN, StrengthMeter } from '@/components/password-strength';
import { ScreenHeader } from '@/components/screen-header';

/** Your sign-in email (and its confirmation) and password. Pinstripe accounts only. */
export default function EmailPasswordScreen() {
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const [login, setLogin] = useState<{ email: string; confirmed: boolean } | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setLogin(await client.login());
    } catch (e) {
      // Other servers manage this on their own website.
      if (e instanceof ApiError && e.status === 404) setUnavailable(true);
      else setError(e instanceof Error ? e.message : 'Couldn’t load your account.');
    }
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <TableBackground>
      <ScreenHeader title="Email & Password" back="Settings" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={styles.pad}>
            <FormError message={error} />
          </View>
        ) : null}
        {unavailable && state.status === 'signedIn' ? (
          <TableGroup footer={`Your account is on ${new URL(state.server).host}. Change your email and password on its website.`}>
            <TableRow title="Managed by your server" />
          </TableGroup>
        ) : (
          <>
            <EmailCard login={login} onChanged={setLogin} />
            <PasswordCard />
          </>
        )}
      </ScrollView>
    </TableBackground>
  );
}

function EmailCard({ login, onChanged }: { login: { email: string; confirmed: boolean } | null; onChanged: (l: { email: string; confirmed: boolean }) => void }) {
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const [editing, setEditing] = useState(false);
  const [email, setEmail] = useState('');
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      onChanged(await client.changeEmail(current, email.trim()));
      setEditing(false);
      setCurrent('');
      setMessage(`We sent a confirmation link to ${email.trim()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t change your email.');
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!client) return;
    try {
      await client.resendConfirmation();
      setMessage('Sent. Check your inbox (and spam folder).');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t send it.');
    }
  };

  return (
    <>
      <TableGroup title="Email" footer={message ?? undefined}>
        {login ? <TableRow title={login.email} detail={login.confirmed ? 'Confirmed' : 'Not Confirmed'} /> : null}
        {login && !login.confirmed && !editing ? <TableRow title="Resend Confirmation" accessory="chevron" onPress={resend} /> : null}
        {editing ? null : <TableRow title="Change Email" accessory="chevron" onPress={() => setEditing(true)} />}
      </TableGroup>
      {error ? (
        <View style={styles.pad}>
          <FormError message={error} />
        </View>
      ) : null}
      {editing ? (
        <>
          <TableGroup>
            <TableField
              label="New Email"
              accessibilityLabel="New email"
              placeholder="you@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <TableField label="Password" accessibilityLabel="Current password" placeholder="Required" secureTextEntry autoComplete="current-password" value={current} onChangeText={setCurrent} />
          </TableGroup>
          <View style={[styles.pad, styles.buttons]}>
            <GelButton tone="gray" rect title="Cancel" onPress={() => setEditing(false)} style={styles.flex} />
            <GelButton rect title={busy ? 'Saving…' : 'Change Email'} disabled={busy || !email.trim() || !current} onPress={save} style={styles.flex} />
          </View>
        </>
      ) : null}
    </>
  );
}

function PasswordCard() {
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = !!again && again !== password;

  const save = async () => {
    if (!client) return;
    setBusy(true);
    setError(null);
    try {
      await client.changePassword(current, password);
      setCurrent('');
      setPassword('');
      setAgain('');
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t change your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <TableGroup
        title="Password"
        footer={done ? 'Password changed. Your other devices have been signed out.' : mismatch ? 'The new passwords don’t match.' : undefined}>
        <TableField label="Current" accessibilityLabel="Current password" placeholder="Required" secureTextEntry autoComplete="current-password" value={current} onChangeText={setCurrent} />
        <TableField
          label="New"
          accessibilityLabel="New password"
          placeholder="8 characters or more"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
        />
        <TableField label="Verify" accessibilityLabel="New password again" placeholder="New password again" secureTextEntry autoComplete="new-password" value={again} onChangeText={setAgain} />
      </TableGroup>
      <View style={styles.meter}>
        <StrengthMeter password={password} />
      </View>
      {error ? (
        <View style={styles.pad}>
          <FormError message={error} />
        </View>
      ) : null}
      <View style={styles.pad}>
        <GelButton rect title={busy ? 'Saving…' : 'Change Password'} disabled={busy || !current || password.length < PASSWORD_MIN || password !== again} onPress={save} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  pad: { marginHorizontal: 10, marginTop: 14 },
  meter: { marginHorizontal: 20, marginTop: 6 },
  buttons: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
