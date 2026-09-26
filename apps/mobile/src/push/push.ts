/**
 * Push notifications on phones: asking permission, getting the Expo push
 * token and giving it to Pinstripe, and opening the right screen when one
 * is tapped. Web has none. Pinstripe servers only (others use Web Push).
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import type { MastodonClient } from '@/api/mastodon';
import { useAuth } from '@/auth/session';

export type PushStatus = 'on' | 'off' | 'ask' | 'unsupported';

// Shown even while the app is open; the badge follows the unread count.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
  });
}

/** Where tapping a notification goes: the post, or the person. */
function open(data: Record<string, unknown> | undefined) {
  if (typeof data?.statusId === 'string') router.push(`/status/${data.statusId}`);
  else if (typeof data?.accountId === 'string') router.push(`/profile/${data.accountId}`);
  else router.push('/notifications');
}

/** The EAS project push tokens belong to (app.json `extra.eas.projectId`, set by `eas init`). */
function projectId(): string | null {
  const id = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  return typeof id === 'string' && id ? id : null;
}

async function pushSupported(client: MastodonClient) {
  return Platform.OS !== 'web' && Device.isDevice && !!projectId() && (await client.supportsPush());
}

/**
 * Registers this phone if notifications are allowed (asking first when
 * `ask` is set). Returns where things stand.
 */
export async function enablePush(client: MastodonClient, options: { ask: boolean }): Promise<PushStatus> {
  if (!(await pushSupported(client).catch(() => false))) return 'unsupported';
  let { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    if (!options.ask) return canAskAgain ? 'ask' : 'off';
    ({ status, canAskAgain } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return 'off';
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Notifications', importance: Notifications.AndroidImportance.HIGH });
  }
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: projectId()! });
  await client.registerPush(token, Platform.OS);
  return 'on';
}

/**
 * At the root of the signed-in app: registers quietly when permission was
 * already given, and opens what a tapped notification points at.
 */
export function usePushNotifications() {
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;

  useEffect(() => {
    if (client) enablePush(client, { ask: false }).catch(() => {});
  }, [client]);

  useEffect(() => {
    if (Platform.OS === 'web' || !client) return;
    // Opened from a notification while the app wasn't running.
    const last = Notifications.getLastNotificationResponse();
    if (last) {
      open(last.notification.request.content.data);
      Notifications.clearLastNotificationResponse();
    }
    const sub = Notifications.addNotificationResponseReceivedListener((response) => open(response.notification.request.content.data));
    return () => sub.remove();
  }, [client]);
}

/** Whether to offer "Turn on notifications" (only when the system can still ask). */
export function usePushStatus(): [PushStatus | null, () => Promise<void>] {
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const [status, setStatus] = useState<PushStatus | null>(null);
  useEffect(() => {
    if (client) enablePush(client, { ask: false }).then(setStatus, () => setStatus('unsupported'));
  }, [client]);
  const turnOn = async () => {
    if (client) setStatus(await enablePush(client, { ask: true }).catch(() => 'off' as const));
  };
  return [status, turnOn];
}
