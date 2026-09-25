import { Link } from 'expo-router';

import { useAccount, useAuth } from '@/auth/session';
import { GelButton, Orb } from '@/components/aqua';
import { Icon } from '@/components/icon';
import { ProfileView } from '@/components/profile-view';

/** Your own profile, with Settings and Edit Profile. */
export default function AccountScreen() {
  const me = useAccount();
  const { refreshAccount } = useAuth();
  return (
    <ProfileView
      account={me}
      viewerId={me.id}
      onRefresh={refreshAccount}
      onDeleted={refreshAccount}
      corner={
        <>
          <Link href="/search" asChild>
            <Orb size={44} accessibilityLabel="Find people">
              <Icon name="search" color="#fff" />
            </Orb>
          </Link>
          <Link href="/settings" asChild>
            <Orb size={44} accessibilityLabel="Settings">
              <Icon name="gear" color="#fff" />
            </Orb>
          </Link>
        </>
      }
      action={
        <Link href="/edit-profile" asChild>
          <GelButton tone="gray" small title="Edit Profile" />
        </Link>
      }
    />
  );
}
