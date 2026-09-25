import { BIO_MAX_LENGTH, PROFILE_FIELDS_MAX } from '@pinstripe/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useAccount, useAuth, useSource } from '@/auth/session';
import { aquaText, Card, Field, GelButton, Pinstripes } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { ScreenHeader } from '@/components/screen-header';
import { colors } from '@/theme/aqua';

const DISPLAY_NAME_MAX = 30;

export default function EditProfileScreen() {
  const me = useAccount();
  const source = useSource();
  const { state, applyCredentials } = useAuth();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [bio, setBio] = useState(source.note);
  const [bot, setBot] = useState(me.bot);
  const [discoverable, setDiscoverable] = useState(me.discoverable);
  const [fields, setFields] = useState(() => {
    const rows = me.fields.map((f) => ({ name: f.name, value: f.value }));
    while (rows.length < PROFILE_FIELDS_MAX) rows.push({ name: '', value: '' });
    return rows;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (i: number, key: 'name' | 'value', text: string) =>
    setFields((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: text } : r)));

  const save = async () => {
    if (state.status !== 'signedIn') return;
    setSaving(true);
    setError(null);
    try {
      const json = await state.client.updateCredentials({
        display_name: displayName,
        note: bio,
        bot,
        discoverable,
        fields_attributes: fields.filter((f) => f.name.trim() || f.value.trim()),
      });
      await applyCredentials(json);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save your profile.');
      setSaving(false);
    }
  };

  return (
    <Pinstripes>
      <ScreenHeader
        title="Edit Profile"
        back="Cancel"
        right={<GelButton small title={saving ? 'Saving…' : 'Save'} disabled={saving} onPress={save} />}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FormError message={error} />
        <Card style={styles.card}>
          {/* Image uploads arrive with the media pipeline. */}
          <GelButton tone="gray" small title="Change Banner" disabled />
          <Text style={aquaText.handle}>1500 × 500 recommended</Text>
          <GelButton tone="gray" small title="Change Photo" disabled />
          <Text style={aquaText.handle}>Square image, at least 400 × 400</Text>
        </Card>
        <Card style={styles.card}>
          <Field label="Display name" maxLength={DISPLAY_NAME_MAX} value={displayName} onChangeText={setDisplayName} />
          <Field label="Bio" multiline maxLength={BIO_MAX_LENGTH} value={bio} onChangeText={setBio} />
          <Text style={[aquaText.handle, styles.right]}>
            {bio.length} / {BIO_MAX_LENGTH}
          </Text>
        </Card>
        <Card style={styles.card}>
          <Text style={[aquaText.body, styles.bold]}>Profile fields</Text>
          <Text style={aquaText.handle}>
            Up to four, shown on your profile. Links that point back here with rel="me" get a green check.
          </Text>
          {fields.map((f, i) => (
            <View key={i} style={styles.pair}>
              <View style={styles.flex}>
                <Field label={`Label ${i + 1}`} value={f.name} onChangeText={(t) => setField(i, 'name', t)} />
              </View>
              <View style={styles.flex2}>
                <Field label={`Content ${i + 1}`} autoCapitalize="none" value={f.value} onChangeText={(t) => setField(i, 'value', t)} />
              </View>
            </View>
          ))}
        </Card>
        <Card style={styles.card}>
          <Toggle title="This is an automated account" sub="Marks the profile as a bot" value={bot} onChange={setBot} />
          <Toggle title="Suggest my account to others" value={discoverable} onChange={setDiscoverable} />
        </Card>
      </ScrollView>
    </Pinstripes>
  );
}

function Toggle({ title, sub, value, onChange }: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggle}>
      <View style={styles.flex}>
        <Text style={aquaText.body}>{title}</Text>
        {sub ? <Text style={aquaText.handle}>{sub}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} accessibilityLabel={title} trackColor={{ true: colors.accent }} thumbColor="#ffffff" />
    </View>
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
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
});
