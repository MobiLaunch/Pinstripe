/**
 * The Pinstripe server this build signs up and signs in to: pinstripe.social
 * in release builds, a local server while developing. Set
 * EXPO_PUBLIC_PINSTRIPE_SERVER to point a build elsewhere; note that an
 * Android emulator reaches the host machine at http://10.0.2.2:8000.
 */
export const PINSTRIPE_SERVER = (
  process.env.EXPO_PUBLIC_PINSTRIPE_SERVER ?? (__DEV__ ? 'http://localhost:8000' : 'https://pinstripe.social')
).replace(/\/+$/, '');

export const PINSTRIPE_DOMAIN = new URL(PINSTRIPE_SERVER).host;
