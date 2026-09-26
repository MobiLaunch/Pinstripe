import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/session';
import { DesktopFrame } from '@/components/desktop-frame';
import { DialogHost } from '@/components/dialog';
import { HudHost } from '@/components/hud';
import { usePushNotifications } from '@/push/push';
import { M3Provider, useM3 } from '@/theme/m3';
import { material } from '@/theme/startup';
import { ThemeProvider, useGlass } from '@/theme/theme';
import { applyMaterialOnWeb } from '@/web-fixes';

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
        <Stack.Screen name="camera" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
        <Stack.Screen name="compose" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="watch/[id]" options={{ animation: 'fade' }} />
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

/** Dark status bar text, except over Liquid Glass or the Android look in dark mode. */
function StatusBarStyle() {
  const glass = useGlass();
  const scheme = useColorScheme();
  return <StatusBar style={(glass || material) && scheme === 'dark' ? 'light' : 'dark'} />;
}

/** The Android look: its font and dark colours on the web preview, and the window behind the app in the surface colour. */
function MaterialWindow() {
  const { c } = useM3();
  useEffect(() => applyMaterialOnWeb(), []);
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(c.surface).catch(() => {});
  }, [c.surface]);
  return null;
}

/** Registers for push notifications and opens what a tapped one points at. */
function PushNotifications() {
  usePushNotifications();
  return null;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <M3Provider>
        <ThemeProvider>
          {material ? <MaterialWindow /> : null}
          <StatusBarStyle />
          <PushNotifications />
          <DesktopFrame>
            <RootStack />
            <HudHost />
          </DesktopFrame>
          <DialogHost />
        </ThemeProvider>
      </M3Provider>
    </AuthProvider>
  );
}
