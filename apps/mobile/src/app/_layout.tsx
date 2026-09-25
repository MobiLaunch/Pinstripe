import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';

import { AuthProvider, useAuth } from '@/auth/session';
import { DialogHost } from '@/components/dialog';
import { usePushNotifications } from '@/push/push';
import { ThemeProvider } from '@/theme/theme';

// On web, the sign-in popup lands back on this app; this hands the result to the opener.
WebBrowser.maybeCompleteAuthSession();

function RootStack() {
  const { state } = useAuth();
  // The saved session loads from secure storage in a few ms; render nothing until then.
  if (state.status === 'loading') return null;
  const signedIn = state.status === 'signedIn';

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
        <Stack.Screen name="settings" />
        <Stack.Screen name="profile/[id]" />
        <Stack.Screen name="status/[id]" />
        <Stack.Screen name="search" />
        <Stack.Screen name="follow-requests" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="report/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="blocked-accounts" />
        <Stack.Screen name="blocked-servers" />
        <Stack.Screen name="moderation" />
        <Stack.Screen name="email-password" />
        <Stack.Screen name="videos/[accountId]" />
        <Stack.Screen name="tag/[name]" />
        <Stack.Screen name="new-video" options={{ presentation: 'modal' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="sign-up" />
        <Stack.Screen name="other-server" options={{ presentation: 'modal' }} />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      <Stack.Screen name="oauth" />
    </Stack>
  );
}

/** Registers for push notifications and opens what a tapped one points at. */
function PushNotifications() {
  usePushNotifications();
  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <StatusBar style="dark" />
        <PushNotifications />
        <RootStack />
        <DialogHost />
      </ThemeProvider>
    </AuthProvider>
  );
}
