import { formatHandle } from '@pinstripe/core';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccount } from '@/auth/session';
import { aquaText, Avatar, GelButton, Group, Orb, Pinstripes, Segmented } from '@/components/aqua';
import { Icon } from '@/components/icon';
import { initials } from '@/components/initials';
import { colors, fontFamily, gradients } from '@/theme/aqua';

const TABS = [
  { value: 'videos', label: 'Videos' },
  { value: 'posts', label: 'Posts' },
  { value: 'boosts', label: 'Boosts' },
] as const;

export default function AccountScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('videos');
  const me = useAccount();
  const counts = me.counts;

  return (
    <Pinstripes>
      <ScrollView>
        <LinearGradient colors={gradients.banner.colors} locations={gradients.banner.locations} style={[styles.banner, { paddingTop: insets.top }]}>
          <Link href="/settings" asChild>
            <Orb size={44} accessibilityLabel="Settings">
              <Icon name="gear" color="#fff" />
            </Orb>
          </Link>
        </LinearGradient>
        <View style={styles.identity}>
          <Avatar initials={initials(me.displayName)} size={96} />
          <Link href="/edit-profile" asChild>
            <GelButton tone="gray" small title="Edit Profile" />
          </Link>
        </View>
        <View style={styles.body}>
          <Text style={styles.name} accessibilityRole="header">{me.displayName}</Text>
          <Text style={aquaText.handle}>{formatHandle(me)}</Text>
          {me.bio ? <Text style={[aquaText.body, styles.bio]}>{me.bio}</Text> : null}
          {me.fields.map((f) => (
            <View key={f.name} style={styles.field}>
              <Text style={styles.fieldName}>{f.name}</Text>
              {f.verifiedAt ? <Icon name="check" size={14} strokeWidth={3} color={colors.verified} /> : null}
              <Text style={[styles.fieldValue, f.verifiedAt && styles.verified]}>{f.value}</Text>
            </View>
          ))}
        </View>
        {counts ? (
          <View style={styles.pad}>
            <Group>
              <View style={styles.stats}>
                <Stat n={counts.posts} label="Posts" />
                <Stat n={counts.following} label="Following" divider />
                <Stat n={counts.followers} label="Followers" divider />
              </View>
            </Group>
          </View>
        ) : null}
        <Segmented options={TABS} value={tab} onChange={setTab} style={styles.pad} />
        <View style={styles.grid}>
          {/* Video thumbnails load here once the account's outbox is wired up. */}
        </View>
      </ScrollView>
    </Pinstripes>
  );
}

function Stat({ n, label, divider = false }: { n: number; label: string; divider?: boolean }) {
  return (
    <View style={[styles.stat, divider && styles.statDivider]}>
      <Text style={styles.statN}>{n.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { height: 150, alignItems: 'flex-end', padding: 14, borderBottomWidth: 1, borderBottomColor: '#0e3f86' },
  identity: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 16, marginTop: -48 },
  body: { paddingHorizontal: 16, paddingTop: 10, gap: 2 },
  name: { fontFamily, fontSize: 20, fontWeight: '700', color: colors.text },
  bio: { marginTop: 8 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  fieldName: { fontFamily, width: 70, fontSize: 12, fontWeight: '700', color: colors.textSubtle },
  fieldValue: { fontFamily, fontSize: 12, color: colors.text },
  verified: { color: colors.verified, fontWeight: '700' },
  pad: { marginHorizontal: 16, marginTop: 14 },
  stats: { flexDirection: 'row' },
  stat: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  statDivider: { borderLeftWidth: 1, borderLeftColor: '#cfcfcf' },
  statN: { fontFamily, fontSize: 17, fontWeight: '700', color: colors.text },
  statLabel: { fontFamily, fontSize: 12, color: colors.textSubtle },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 12, minHeight: 200 },
});
