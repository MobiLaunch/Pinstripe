import { BIO_MAX_LENGTH, PROFILE_FIELDS_MAX } from '@pinstripe/core';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { checkPicked, type Picked, updateProfileImages } from '@/api/upload';
import { useAccount, useAuth, useSource } from '@/auth/session';
import { AquaSwitch, Avatar, TableField } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { initials } from '@/components/initials';
import { BarButton, TableBackground, TableGroup, TableRow } from '@/components/ios6';
import { ScreenHeader } from '@/components/screen-header';
import { fontFamily } from '@/theme/aqua';

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
  // New images are only sent on Save, so Cancel really cancels.
  const [images, setImages] = useState<{ avatar?: Picked; header?: Picked }>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (kind: 'avatar' | 'header') => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: kind === 'avatar' ? [1, 1] : [3, 1],
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      quality: 0.9,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    const problem = checkPicked(asset);
    setError(problem);
    if (!problem) setImages((current) => ({ ...current, [kind]: asset }));
  };

  const setField = (i: number, key: 'name' | 'value', text: string) =>
    setFields((rows) => rows.map((r, j) => (j === i ? { ...r, [key]: text } : r)));

  const save = async () => {
    if (state.status !== 'signedIn') return;
    setSaving(true);
    setError(null);
    try {
      if (images.avatar || images.header) await updateProfileImages(state.client, state.token, images);
      const json = await state.client.updateCredentials({
        display_name: displayName,
        note: bio,
        bot,
        discoverable,
        fields_attributes: fields.filter((f) => f.name.trim() || f.value.trim()),
      });
      await applyCredentials(json);
      // Opened directly (a link, a reload) there's nothing to go back to.
      if (router.canGoBack()) router.back();
      else router.replace('/account');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save your profile.');
      setSaving(false);
    }
  };

  return (
    <TableBackground>
      <ScreenHeader
        title="Edit Profile"
        back="Cancel"
        right={<BarButton done title={saving ? 'Saving…' : 'Save'} disabled={saving} onPress={save} />}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={styles.pad}>
            <FormError message={error} />
          </View>
        ) : null}
        <View style={styles.photos}>
          <View style={styles.banner}>
            {images.header || me.bannerUrl ? (
              <Image source={{ uri: images.header?.uri ?? me.bannerUrl! }} style={styles.fill} contentFit="cover" accessibilityLabel="Banner" />
            ) : null}
          </View>
          {/* The Contacts photo well: a white-framed picture on the page. */}
          <View style={styles.photoWell}>
            <Avatar initials={initials(displayName || me.username)} size={74} uri={images.avatar?.uri ?? me.avatarUrl} />
          </View>
        </View>
        <TableGroup footer="Photo: square, at least 400 × 400. Banner: 1500 × 500.">
          <TableRow title="Change Photo" accessory="chevron" disabled={saving} onPress={() => pick('avatar')} />
          <TableRow title="Change Banner" accessory="chevron" disabled={saving} onPress={() => pick('header')} />
        </TableGroup>
        <TableGroup footer={`${bio.length} / ${BIO_MAX_LENGTH}`}>
          <TableField label="Name" placeholder={me.username} maxLength={DISPLAY_NAME_MAX} value={displayName} onChangeText={setDisplayName} />
          <TableField label="Bio" placeholder="About you" multiline maxLength={BIO_MAX_LENGTH} value={bio} onChangeText={setBio} />
        </TableGroup>
        <TableGroup title="Profile Fields" footer="Up to four, shown on your profile. Links that point back here with rel=“me” get a green check.">
          {fields.map((f, i) => (
            <View key={i} style={styles.pair}>
              <TextInput
                accessibilityLabel={`Label ${i + 1}`}
                placeholder="label"
                placeholderTextColor="#a7b4c8"
                value={f.name}
                onChangeText={(t) => setField(i, 'name', t)}
                style={styles.pairLabel}
              />
              <TextInput
                accessibilityLabel={`Content ${i + 1}`}
                placeholder="Website or anything"
                placeholderTextColor="#b3b3b3"
                autoCapitalize="none"
                value={f.value}
                onChangeText={(t) => setField(i, 'value', t)}
                style={styles.pairValue}
              />
            </View>
          ))}
        </TableGroup>
        <TableGroup>
          <TableRow title="Automated Account" sub="Marks the profile as a bot" right={<AquaSwitch value={bot} onValueChange={setBot} accessibilityLabel="This is an automated account" />} />
          <TableRow
            title="Suggest My Account"
            sub="Shown to people looking for others to follow"
            right={<AquaSwitch value={discoverable} onValueChange={setDiscoverable} accessibilityLabel="Suggest my account to others" />}
          />
        </TableGroup>
      </ScrollView>
    </TableBackground>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  pad: { marginHorizontal: 10, marginTop: 14 },
  // Room for the photo well hanging off the banner.
  photos: { marginHorizontal: 10, marginTop: 14, marginBottom: 22 },
  banner: { height: 110, borderRadius: 10, overflow: 'hidden', backgroundColor: '#9fb3cc', borderWidth: 1, borderColor: '#8a95a3' },
  fill: { width: '100%', height: '100%' },
  photoWell: {
    position: 'absolute',
    left: 14,
    bottom: -26,
    padding: 3,
    borderRadius: 8,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#a6adb6',
    boxShadow: '0 2px 4px rgba(0,0,0,0.35)',
  },
  pair: { flexDirection: 'row', minHeight: 44 },
  pairLabel: {
    width: 96,
    fontFamily,
    fontSize: 14,
    fontWeight: '700',
    color: '#385487',
    textAlign: 'right',
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    outlineWidth: 0,
  },
  pairValue: { flex: 1, fontFamily, fontSize: 16, color: '#000000', paddingHorizontal: 10, outlineWidth: 0 },
});
