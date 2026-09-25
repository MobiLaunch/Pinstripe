/**
 * The Pinstripe server this build signs up and signs in to. Set
 * EXPO_PUBLIC_PINSTRIPE_SERVER for other environments; note that an Android
 * emulator reaches the host machine at http://10.0.2.2:8000, not localhost.
 */
export const PINSTRIPE_SERVER = (process.env.EXPO_PUBLIC_PINSTRIPE_SERVER ?? 'http://localhost:8000').replace(/\/+$/, '');

export const PINSTRIPE_DOMAIN = new URL(PINSTRIPE_SERVER).host;
