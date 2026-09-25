import { Link, router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '@/auth/session';
import { aquaText, GelButton, Pinstripes, TableField } from '@/components/aqua';
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
          <FormError message={error} />
          <View style={styles.table}>
            <TableField
              label="Username"
              accessibilityLabel="Username or email"
              placeholder="or email"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              value={login}
              onChangeText={setLogin}
            />
            <View style={styles.divider} />
            <TableField
              label="Password"
              placeholder="Required"
              secureTextEntry
              autoComplete="current-password"
              textContentType="password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={submit}
            />
          </View>
          <GelButton rect title={busy ? 'Signing In…' : 'Sign In'} disabled={busy || !login || !password} onPress={submit} />
          <Link href="/forgot-password" style={[aquaText.link, styles.center]}>
            Forgot your password?
          </Link>
          <GelButton tone="gray" rect title="Use an account on another server" onPress={() => router.push('/other-server')} />
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
  // Letterpressed into the page, as iOS 6 did with titles on linen and pinstripes.
  wordmark: {
    fontFamily,
    fontSize: 40,
    fontWeight: '700',
    color: '#0e4fae',
    textShadowColor: 'rgba(255,255,255,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  table: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#aaaeb3',
    overflow: 'hidden',
    boxShadow: '0 1px 0 rgba(255,255,255,0.8)',
  },
  divider: { height: 1, backgroundColor: '#e0e0e0' },
  center: { textAlign: 'center' },
});
