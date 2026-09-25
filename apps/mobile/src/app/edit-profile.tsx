import { BIO_MAX_LENGTH, PROFILE_FIELDS_MAX } from '@pinstripe/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAccount } from '@/auth/session';
import { aquaText, Card, Field, GelButton, Pinstripes } from '@/components/aqua';
import { ScreenHeader } from '@/components/screen-header';

export default function EditProfileScreen() {
  const me = useAccount();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(me.bio);
  const [fields, setFields] = useState(() => {
    const rows = me.fields.map((f) => ({ name: f.name, value: f.value }));
    while (rows.length < PROFILE_FIELDS_MAX) rows.push({ name: '', value: '' });
    return rows;
  });

  const setField = (i: number, key: 'name' | 'value', text: string) =>
    setFields((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: text } : r)));

  return (
    <Pinstripes>
      <ScreenHeader title="Edit Profile" back="Cancel" right={<GelButton small title="Save" onPress={() => router.back()} />} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <GelButton tone="gray" small title="Change Banner" />
          <Text style={aquaText.handle}>1500 × 500 recommended</Text>
          <GelButton tone="gray" small title="Change Photo" />
          <Text style={aquaText.handle}>Square image, at least 400 × 400</Text>
        </Card>
        <Card style={styles.card}>
          <Field label="Display name" value={displayName} onChangeText={setDisplayName} />
          <Field label="Bio" multiline maxLength={BIO_MAX_LENGTH} value={bio} onChangeText={setBio} />
          <Text style={[aquaText.handle, styles.right]}>{bio.length} / {BIO_MAX_LENGTH}</Text>
        </Card>
        <Card style={styles.card}>
          <Text style={[aquaText.body, styles.bold]}>Profile fields</Text>
          <Text style={aquaText.handle}>
            Up to four, shown on your profile. Links that point back here with rel="me" get a green check.
          </Text>
          {fields.map((f, i) => (
            <View key={i} style={styles.pair}>
              <View style={styles.flex}><Field label={`Label ${i + 1}`} value={f.name} onChangeText={(t) => setField(i, 'name', t)} /></View>
              <View style={styles.flex2}><Field label={`Content ${i + 1}`} autoCapitalize="none" value={f.value} onChangeText={(t) => setField(i, 'value', t)} /></View>
            </View>
          ))}
        </Card>
      </ScrollView>
    </Pinstripes>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  card: { gap: 10, padding: 16 },
  right: { textAlign: 'right' },
  bold: { fontWeight: '700' },
  pair: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  flex2: { flex: 2 },
});
