import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Tokens and client secrets live in the Keychain / Keystore on devices.
 * SecureStore doesn't exist on web, where localStorage is the only option.
 */
export const secureStorage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return globalThis.localStorage?.setItem(key, value);
    await SecureStore.setItemAsync(key, value);
  },
  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') return globalThis.localStorage?.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  },
};

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await secureStorage.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setJson(key: string, value: unknown) {
  return secureStorage.set(key, JSON.stringify(value));
}
