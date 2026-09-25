import { isValidUsername } from '@pinstripe/core';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ApiError, type FieldErrors } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { aquaText, Card, Field, GelButton, Pinstripes } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { PASSWORD_MIN, StrengthMeter } from '@/components/password-strength';
import { ScreenHeader } from '@/components/screen-header';
import { PINSTRIPE_DOMAIN, PINSTRIPE_SERVER } from '@/config';
import { colors, fontFamily } from '@/theme/aqua';

const FIELD_LABELS: Record<string, string> = { username: 'Username', email: 'Email', password: 'Password', agreement: 'Agreement' };

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const ready = isValidUsername(username) && email.includes('@') && password.length >= PASSWORD_MIN && agreed;
  const fieldError = (field: string) => fieldErrors[field]?.[0]?.description;

  const submit = async () => {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      await signUp(PINSTRIPE_SERVER, { username, email, password, locale: 'en' });
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.details).length) {
        setFieldErrors(e.details);
        setError('Please fix the highlighted fields.');
      } else {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      }
      setBusy(false);
    }
  };

  const hint = (field: string) => {
    const message = fieldError(field);
    return message ? (
      <Text style={styles.fieldError}>
        {FIELD_LABELS[field]} {message}
      </Text>
    ) : null;
  };

  return (
    <Pinstripes>
      <ScreenHeader title="Create Account" back="Sign In" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <FormError message={error} />
          <View style={styles.group}>
            <Field
              label="Username"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username-new"
              value={username}
              onChangeText={setUsername}
            />
            <Text style={aquaText.handle}>
              @{username || 'you'}@{PINSTRIPE_DOMAIN}
            </Text>
            {hint('username')}
          </View>
          <View style={styles.group}>
            <Field
              label="Email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            {hint('email')}
          </View>
          <View style={styles.group}>
            <Field label="Password" secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
            <StrengthMeter password={password} />
            {hint('password')}
          </View>
          <View style={styles.agree}>
            <Switch
              value={agreed}
              onValueChange={setAgreed}
              accessibilityLabel="I agree to the server rules and privacy policy"
              trackColor={{ true: colors.accent }}
              thumbColor="#ffffff"
            />
            <Text style={[aquaText.body, styles.flex]}>I agree to the server rules and privacy policy.</Text>
          </View>
          <GelButton title={busy ? 'Creating…' : 'Create Account'} disabled={busy || !ready} onPress={submit} />
        </Card>
        <Text style={[aquaText.handle, styles.note]}>
          Your handle works across the fediverse. People on Mastodon, Pixelfed and other ActivityPub apps can follow @
          {username || 'you'}@{PINSTRIPE_DOMAIN}.
        </Text>
      </ScrollView>
    </Pinstripes>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  card: { gap: 14, padding: 16 },
  group: { gap: 4 },
  fieldError: { fontFamily, fontSize: 12, color: colors.danger },
  agree: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  note: { textAlign: 'center', paddingHorizontal: 8 },
});
