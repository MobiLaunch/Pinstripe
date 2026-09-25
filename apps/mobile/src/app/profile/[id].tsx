import type { Account } from '@pinstripe/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { type MastodonRelationship, toAccount } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { GelButton, Orb, Pinstripes } from '@/components/aqua';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { ProfileView } from '@/components/profile-view';

/** Someone's profile, with Follow / Unfollow / Requested. */
export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const [account, setAccount] = useState<Account | null>(null);
  const [relationship, setRelationship] = useState<MastodonRelationship | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = state.status === 'signedIn' ? state.client : null;
  const server = state.status === 'signedIn' ? state.server : '';
  const viewerId = state.status === 'signedIn' ? state.account.id : '';

  const load = useCallback(async () => {
    if (!client || !id) return;
    try {
      const [json, rel] = await Promise.all([client.account(id), client.relationship(id)]);
      setAccount(toAccount(json, server));
      setRelationship(rel);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t load this profile.');
    }
  }, [client, server, id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = async () => {
    if (!client || !relationship) return;
    setBusy(true);
    try {
      const unfollow = relationship.following || relationship.requested;
      const next = await client.follow(id, unfollow ? 'unfollow' : 'follow');
      setRelationship(next);
      // Counts changed; reload quietly.
      load();
      // Remote servers accept follows a moment later; check back rather than
      // showing "Requested" for an account that doesn't need approval.
      if (next.requested && account && !account.locked) {
        for (const delay of [1000, 3000, 6000]) setTimeout(load, delay);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t update the follow.');
    } finally {
      setBusy(false);
    }
  };

  const back = (
    <Orb size={44} accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
      <Icon name="chevronLeft" color="#fff" />
    </Orb>
  );

  if (!account) {
    return (
      <Pinstripes>
        <View style={styles.state}>
          {error ? <FormError message={error} /> : <ActivityIndicator />}
          <View style={styles.back}>{back}</View>
        </View>
      </Pinstripes>
    );
  }

  const isMe = account.id === viewerId;
  const label = relationship?.following ? 'Following' : relationship?.requested ? 'Requested' : relationship?.followed_by ? 'Follow Back' : 'Follow';
  return (
    <ProfileView
      account={account}
      viewerId={viewerId}
      onRefresh={load}
      corner={back}
      action={
        isMe ? null : (
          <GelButton
            small
            tone={relationship?.following || relationship?.requested ? 'gray' : 'blue'}
            title={busy ? '…' : label}
            accessibilityLabel={relationship?.following ? `Unfollow ${account.displayName}` : `${label} ${account.displayName}`}
            disabled={busy || !relationship}
            onPress={toggleFollow}
          />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  back: { position: 'absolute', top: 48, left: 14 },
});
