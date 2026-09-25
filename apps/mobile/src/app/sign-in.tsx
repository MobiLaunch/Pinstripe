import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { aquaText, Card, Field, GelButton, Pinstripes } from '@/components/aqua';
import { fontFamily } from '@/theme/aqua';

export default function SignInScreen() {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');

  return (
    <Pinstripes>
      <SafeAreaView style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Text style={styles.wordmark}>Pinstripe</Text>
            <Text style={aquaText.handle}>Short videos for the fediverse.</Text>
          </View>
          <Card style={styles.card}>
            <Field label="Username or email" autoCapitalize="none" autoComplete="username" value={login} onChangeText={setLogin} />
            <Field label="Password" secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} />
            <Text style={aquaText.link} accessibilityRole="link">Forgot password?</Text>
            <GelButton title="Sign In" disabled={!login || !password} />
          </Card>
          {/* Signs in through the user's home server via OAuth. */}
          <GelButton tone="gray" title="Use an account on another server" />
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
