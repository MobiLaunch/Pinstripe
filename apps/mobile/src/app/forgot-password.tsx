import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { MastodonClient } from '@/api/mastodon';
import { aquaText, Card, Field, GelButton } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { TableBackground } from '@/components/ios6';
import { ScreenHeader } from '@/components/screen-header';
import { PINSTRIPE_DOMAIN, PINSTRIPE_SERVER } from '@/config';

/** Asks Pinstripe to email a link for choosing a new password. */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await new MastodonClient(PINSTRIPE_SERVER).requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t send the email. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <TableBackground>
      <ScreenHeader title="Reset Password" back="Back" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {sent ? (
          <Card style={styles.card}>
            <Text style={[aquaText.body, styles.bold]}>Check your email</Text>
            <Text style={aquaText.body}>
              If {email.trim()} belongs to a {PINSTRIPE_DOMAIN} account, a link to choose a new password is on its way. It works for an hour.
            </Text>
            <GelButton title="Back to Sign In" onPress={() => (router.canGoBack() ? router.back() : router.replace('/sign-in'))} />
          </Card>
        ) : (
          <Card style={styles.card}>
            <FormError message={error} />
            <Text style={aquaText.body}>Enter the email for your {PINSTRIPE_DOMAIN} account and we’ll send a link to choose a new password.</Text>
            <Field
              label="Email"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={submit}
            />
            <GelButton title={busy ? 'Sending…' : 'Send Link'} disabled={busy || !valid} onPress={submit} />
            <Text style={aquaText.handle}>Signed up on another server? Reset your password there instead.</Text>
          </Card>
        )}
      </ScrollView>
    </TableBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16 },
  card: { gap: 12, padding: 16 },
  bold: { fontWeight: '700' },
});
