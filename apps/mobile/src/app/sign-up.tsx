import { isValidUsername } from '@pinstripe/core';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { aquaText, Card, Field, GelButton, Pinstripes } from '@/components/aqua';
import { ScreenHeader } from '@/components/screen-header';
import { colors } from '@/theme/aqua';

// The server this build signs up to; will come from config once multi-server lands.
const DOMAIN = 'pinstripe.social';

export default function SignUpScreen() {
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);

  const usernameOk = isValidUsername(username);
  const ready = usernameOk && email.includes('@') && password.length >= 8 && agreed;

  return (
    <Pinstripes>
      <ScreenHeader title="Create Account" back="Sign In" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} />
          <Field label="Username" autoCapitalize="none" autoCorrect={false} value={username} onChangeText={setUsername} />
          <Text style={aquaText.handle}>@{username || 'you'}@{DOMAIN}</Text>
          <Field label="Email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} />
          <Field label="Password" secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
          <View style={styles.agree}>
            <Switch value={agreed} onValueChange={setAgreed} accessibilityLabel="I agree to the server rules and privacy policy" trackColor={{ true: colors.accent }} thumbColor="#ffffff" />
            <Text style={[aquaText.body, styles.flex]}>I agree to the server rules and privacy policy.</Text>
          </View>
          <GelButton title="Create Account" disabled={!ready} />
        </Card>
        <Text style={[aquaText.handle, styles.note]}>
          Your handle works across the fediverse. People on Mastodon, Pixelfed and other ActivityPub apps can follow @
          {username || 'you'}@{DOMAIN}.
        </Text>
      </ScrollView>
    </Pinstripes>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  card: { gap: 14, padding: 16 },
  agree: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flex: { flex: 1 },
  note: { textAlign: 'center', paddingHorizontal: 8 },
});
