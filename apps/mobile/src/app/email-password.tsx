import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { aquaText, Card, Field, GelButton, Pinstripes } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { PASSWORD_MIN, StrengthMeter } from '@/components/password-strength';
import { ScreenHeader } from '@/components/screen-header';
import { colors } from '@/theme/aqua';

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
    <Pinstripes>
      <ScreenHeader title="Email & Password" back="Settings" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FormError message={error} />
        {unavailable && state.status === 'signedIn' ? (
          <Card style={styles.card}>
            <Text style={aquaText.body}>Your account is on {new URL(state.server).host}. Change your email and password on its website.</Text>
          </Card>
        ) : (
          <>
            <EmailCard login={login} onChanged={setLogin} />
            <PasswordCard />
          </>
        )}
      </ScrollView>
    </Pinstripes>
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
    <Card style={styles.card}>
      <Text style={[aquaText.body, styles.bold]}>Email</Text>
      <FormError message={error} />
      {login ? (
        <View style={styles.row}>
          <Text style={[aquaText.body, styles.flex]}>{login.email}</Text>
          <Text style={[styles.badge, login.confirmed ? styles.confirmed : styles.unconfirmed]}>{login.confirmed ? 'Confirmed' : 'Not confirmed'}</Text>
        </View>
      ) : null}
      {message ? <Text style={aquaText.handle}>{message}</Text> : null}
      {login && !login.confirmed && !editing ? <GelButton tone="gray" small title="Resend Confirmation" onPress={resend} /> : null}
      {editing ? (
        <>
          <Field label="New email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
          <Field label="Current password" secureTextEntry autoComplete="current-password" value={current} onChangeText={setCurrent} />
          <View style={styles.buttons}>
            <GelButton tone="gray" small title="Cancel" onPress={() => setEditing(false)} />
            <GelButton small title={busy ? 'Saving…' : 'Change Email'} disabled={busy || !email.trim() || !current} onPress={save} />
          </View>
        </>
      ) : (
        <GelButton tone="gray" small title="Change Email" onPress={() => setEditing(true)} />
      )}
    </Card>
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
    <Card style={styles.card}>
      <Text style={[aquaText.body, styles.bold]}>Password</Text>
      <FormError message={error} />
      {done ? <Text style={[aquaText.body, styles.ok]}>Password changed. Your other devices have been signed out.</Text> : null}
      <Field label="Current password" secureTextEntry autoComplete="current-password" value={current} onChangeText={setCurrent} />
      <Field label="New password" secureTextEntry autoComplete="new-password" textContentType="newPassword" value={password} onChangeText={setPassword} />
      <StrengthMeter password={password} />
      <Field label="New password again" secureTextEntry autoComplete="new-password" value={again} onChangeText={setAgain} />
      {mismatch ? <Text style={[aquaText.handle, styles.bad]}>The passwords don’t match.</Text> : null}
      <GelButton
        small
        title={busy ? 'Saving…' : 'Change Password'}
        disabled={busy || !current || password.length < PASSWORD_MIN || password !== again}
        onPress={save}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  card: { gap: 10, padding: 16 },
  bold: { fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  flex: { flex: 1 },
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, overflow: 'hidden', color: '#fff' },
  confirmed: { backgroundColor: colors.verified },
  unconfirmed: { backgroundColor: '#9a6a08' },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  ok: { color: colors.verified },
  bad: { color: colors.danger },
});
