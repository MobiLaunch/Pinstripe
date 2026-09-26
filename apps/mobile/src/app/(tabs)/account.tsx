import { Link } from 'expo-router';

import { useAccount, useAuth } from '@/auth/session';
import { GelButton } from '@/components/aqua';
import { Icon } from '@/components/icon';
import { BarButton } from '@/components/ios6';
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
      left={
        <Link href="/search" asChild>
          <BarButton accessibilityLabel="Find people" icon={<Icon name="search" size={16} strokeWidth={2.6} color="#fff" />} />
        </Link>
      }
      right={
        <Link href="/settings" asChild>
          <BarButton accessibilityLabel="Settings" icon={<Icon name="gear" size={18} strokeWidth={2} color="#fff" />} />
        </Link>
      }
      action={
        <Link href="/edit-profile" asChild>
          <GelButton tone="gray" small title="Edit Profile" />
        </Link>
      }
    />
  );
}
