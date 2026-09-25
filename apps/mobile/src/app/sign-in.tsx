import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/session';
import { aquaText, Card, Field, GelButton, Pinstripes } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { PINSTRIPE_SERVER } from '@/config';
import { fontFamily } from '@/theme/aqua';

export default function SignInScreen() {
  const { signInWithPassword } = useAuth();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(PINSTRIPE_SERVER, login, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <Pinstripes>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.wordmark}>Pinstripe</Text>
            <Text style={aquaText.handle}>Short videos for the fediverse.</Text>
          </View>
          <Card style={styles.card}>
            <FormError message={error} />
            <Field
              label="Username or email"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              value={login}
              onChangeText={setLogin}
            />
            <Field
              label="Password"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            />
            <GelButton title={busy ? 'Signing In…' : 'Sign In'} disabled={busy || !login || !password} onPress={submit} />
            <Link href="/forgot-password" style={[aquaText.link, styles.center]}>
              Forgot your password?
            </Link>
          </Card>
          <GelButton tone="gray" title="Use an account on another server" onPress={() => router.push('/other-server')} />
          <Text style={[aquaText.body, styles.center]}>
            New to Pinstripe? <Link href="/sign-up" style={aquaText.link}>Create an account</Link>
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Pinstripes>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 24, gap: 16, flexGrow: 1, justifyContent: 'center' },
  brand: { alignItems: 'center', gap: 4, marginBottom: 8 },
  wordmark: { fontFamily, fontSize: 34, fontWeight: '700', color: '#0e4fae' },
  card: { gap: 14, padding: 16 },
  center: { textAlign: 'center' },
});
