import { useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { normalizeServer } from '@/api/mastodon';
import { SignInCancelled } from '@/auth/oauth';
import { useAuth } from '@/auth/session';
import { aquaText, Card, Field, GelButton } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { TableBackground } from '@/components/ios6';
import { ScreenHeader } from '@/components/screen-header';

/** Sign in with an account on Mastodon or any server that speaks its API. */
export default function OtherServerScreen() {
  const { signInWithBrowser } = useAuth();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const server = normalizeServer(input);

  const submit = async () => {
    if (!server) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithBrowser(server);
    } catch (e) {
      if (!(e instanceof SignInCancelled)) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      }
      setBusy(false);
    }
  };

  return (
    <TableBackground>
      <ScreenHeader title="Other Server" back="Cancel" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <FormError message={error} />
          <Field
            label="Your server"
            placeholder="mastodon.social"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={input}
            onChangeText={setInput}
            onSubmitEditing={submit}
          />
          <GelButton title={busy ? 'Opening…' : 'Continue'} disabled={busy || !server} onPress={submit} />
        </Card>
        <Text style={[aquaText.handle, styles.note]}>
          You’ll sign in on your server’s own page, so Pinstripe never sees your password. Works with Mastodon and
          other servers that support its apps.
        </Text>
      </ScrollView>
    </TableBackground>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  card: { gap: 14, padding: 16 },
  note: { textAlign: 'center', paddingHorizontal: 8 },
});
