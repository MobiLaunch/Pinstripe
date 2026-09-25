import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/session';

const POLL_MS = 60_000;

/** Every mounted badge hears when notifications are read, so it clears straight away. */
const listeners = new Set<(count: number) => void>();
export function setUnreadNotifications(count: number) {
  for (const listener of listeners) listener(count);
}

/**
 * The unread notification count, checked when the screen comes into view,
 * when the app returns to the foreground, and every minute while it's open.
 * Push notifications will replace the polling.
 */
export function useUnreadNotifications(): number {
  const { state } = useAuth();
  const client = state.status === 'signedIn' ? state.client : null;
  const [count, setCount] = useState(0);

  const check = useCallback(() => {
    client?.unreadNotifications().then(setCount).catch(() => {});
  }, [client]);

  useEffect(() => {
    listeners.add(setCount);
    return () => void listeners.delete(setCount);
  }, []);

  useFocusEffect(
    useCallback(() => {
      check();
      const timer = setInterval(check, POLL_MS);
      const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
      return () => {
        clearInterval(timer);
        sub.remove();
      };
    }, [check]),
  );

  return count;
}
