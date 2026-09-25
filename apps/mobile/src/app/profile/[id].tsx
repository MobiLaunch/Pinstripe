import { type Account, formatHandle } from '@pinstripe/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { type MastodonRelationship, toAccount } from '@/api/mastodon';
import { useAuth } from '@/auth/session';
import { ActionMenu, type MenuAction } from '@/components/action-menu';
import { GelButton, Pinstripes } from '@/components/aqua';
import { confirm } from '@/components/confirm';
import { FormError } from '@/components/form-error';
import { Icon } from '@/components/icon';
import { BackButton, NavBar, Spinner } from '@/components/ios6';
import { ProfileView } from '@/components/profile-view';
import { PINSTRIPE_DOMAIN } from '@/config';

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

  const [menuOpen, setMenuOpen] = useState(false);

  /** Runs a menu action that returns the new relationship. */
  const act = async (work: () => Promise<MastodonRelationship | object>) => {
    setError(null);
    try {
      const next = await work();
      if ('id' in next && 'following' in next) setRelationship(next as MastodonRelationship);
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t work. Please try again.');
    }
  };

  const menu = (): MenuAction[] => {
    if (!client || !account || !relationship) return [];
    const name = account.displayName;
    const actions: MenuAction[] = [
      relationship.muting
        ? { label: `Unmute ${name}`, onPress: () => act(() => client.unmute(id)) }
        : { label: `Mute ${name}`, onPress: () => act(() => client.mute(id)) },
      relationship.blocking
        ? { label: `Unblock ${name}`, onPress: () => act(() => client.block(id, 'unblock')) }
        : {
            label: `Block ${name}`,
            destructive: true,
            onPress: async () => {
              if (await confirm(`Block ${name}?`, 'They won’t be able to follow you or see your posts, and you won’t see theirs.', 'Block')) {
                act(() => client.block(id, 'block'));
              }
            },
          },
      { label: `Report ${name}`, destructive: true, onPress: () => router.push(`/report/${id}`) },
    ];
    if (account.domain && account.domain !== PINSTRIPE_DOMAIN) {
      const domain = account.domain;
      actions.push(
        relationship.domain_blocking
          ? { label: `Unblock ${domain}`, onPress: () => act(() => client.blockDomain(domain, 'unblock')) }
          : {
              label: `Block everything from ${domain}`,
              destructive: true,
              onPress: async () => {
                if (await confirm(`Block ${domain}?`, 'You won’t see posts or notifications from anyone there, and followers from there are removed.', 'Block')) {
                  act(() => client.blockDomain(domain, 'block'));
                }
              },
            },
      );
    }
    return actions;
  };

  const back = <BackButton />;

  if (!account) {
    return (
      <Pinstripes>
        <NavBar left={back} />
        <View style={styles.state}>{error ? <FormError message={error} /> : <Spinner />}</View>
      </Pinstripes>
    );
  }

  const isMe = account.id === viewerId;
  const label = relationship?.following ? 'Following' : relationship?.requested ? 'Requested' : relationship?.followed_by ? 'Follow Back' : 'Follow';
  const cantFollow = relationship?.blocked_by || relationship?.domain_blocking;
  return (
    <>
      <ProfileView
        account={account}
        viewerId={viewerId}
        onRefresh={load}
        left={back}
        postsKey={[relationship?.blocking, relationship?.blocked_by].join()}
        notice={
          error ??
          (relationship?.blocking
            ? 'You’ve blocked this account.'
            : relationship?.blocked_by
              ? 'This account has blocked you.'
              : relationship?.muting
                ? 'You’ve muted this account. Their posts won’t show in your feeds.'
                : null)
        }
        action={
          isMe ? null : (
            <View style={styles.actions}>
              {relationship?.blocking ? (
                <GelButton small tone="red" title="Unblock" accessibilityLabel={`Unblock ${account.displayName}`} onPress={() => act(() => client!.block(id, 'unblock'))} />
              ) : cantFollow ? null : (
                <GelButton
                  small
                  tone={relationship?.following || relationship?.requested ? 'gray' : 'blue'}
                  title={busy ? '…' : label}
                  accessibilityLabel={relationship?.following ? `Unfollow ${account.displayName}` : `${label} ${account.displayName}`}
                  disabled={busy || !relationship}
                  onPress={toggleFollow}
                />
              )}
              <GelButton
                small
                tone="gray"
                accessibilityLabel="More"
                disabled={!relationship}
                onPress={() => setMenuOpen(true)}
                icon={<Icon name="more" size={18} color="#1a1a1a" />}
              />
            </View>
          )
        }
      />
      <ActionMenu visible={menuOpen} title={formatHandle(account)} actions={menuOpen ? menu() : []} onClose={() => setMenuOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 8 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
});
