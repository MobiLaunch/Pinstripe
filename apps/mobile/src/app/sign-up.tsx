import { isValidUsername } from '@pinstripe/core';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiError, type FieldErrors } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { AquaSwitch, GelButton, TableField } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { showHud } from '@/components/hud';
import { TableBackground, TableGroup, TableRow } from '@/components/ios6';
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
    const hud = showHud('Creating Account…');
    try {
      await signUp(PINSTRIPE_SERVER, { username, email, password, locale: 'en' });
      hud.hide();
    } catch (e) {
      hud.hide();
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
    <TableBackground>
      <ScreenHeader title="Create Account" back="Sign In" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={styles.pad}>
            <FormError message={error} />
          </View>
        ) : null}
        <TableGroup footer={`@${username || 'you'}@${PINSTRIPE_DOMAIN}`}>
          <TableField
            label="Username"
            placeholder="letters, numbers, _"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            value={username}
            onChangeText={setUsername}
          />
        </TableGroup>
        {hint('username')}
        <TableGroup>
          <TableField
            label="Email"
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
          />
          <TableField label="Password" placeholder="8 characters or more" secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
        </TableGroup>
        <View style={styles.meter}>
          <StrengthMeter password={password} />
        </View>
        {hint('email')}
        {hint('password')}
        <TableGroup>
          <TableRow
            title="I agree to the server rules and privacy policy."
            right={<AquaSwitch value={agreed} onValueChange={setAgreed} accessibilityLabel="I agree to the server rules and privacy policy" />}
          />
        </TableGroup>
        <View style={styles.pad}>
          <GelButton rect title={busy ? 'Creating…' : 'Create Account'} disabled={busy || !ready} onPress={submit} />
        </View>
        <Text style={styles.note}>
          Your handle works across the fediverse. People on Mastodon, Pixelfed and other ActivityPub apps can follow @{username || 'you'}@
          {PINSTRIPE_DOMAIN}.
        </Text>
      </ScrollView>
    </TableBackground>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  pad: { marginHorizontal: 10, marginTop: 14 },
  meter: { marginHorizontal: 20, marginTop: 6 },
  fieldError: { fontFamily, fontSize: 13, color: colors.danger, marginHorizontal: 20, marginTop: 6 },
  note: {
    fontFamily,
    fontSize: 14,
    color: '#4c566c',
    textAlign: 'center',
    margin: 20,
    textShadowColor: '#ffffff',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
});
