import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { ApiError, MastodonClient, type MastodonApp, SCOPES } from '@/api/mastodon';

import { getJson, setJson } from './storage';

/** Where servers send the user back after signing in: pinstripe://oauth, or /oauth on web. */
export function redirectUri(): string {
  return Linking.createURL('oauth');
}

type AppCache = Record<string, MastodonApp & { redirect_uri: string }>;
const APPS_KEY = 'pinstripe.apps';

/**
 * Registers the app with a server once and remembers the credentials.
 * Re-registers if the redirect URI changed (e.g. a new dev URL on web).
 */
export async function appFor(server: string): Promise<MastodonApp> {
  const redirect = redirectUri();
  const cache = (await getJson<AppCache>(APPS_KEY)) ?? {};
  const cached = cache[server];
  if (cached && cached.redirect_uri === redirect) return cached;
  const app = await new MastodonClient(server).registerApp(redirect);
  cache[server] = { client_id: app.client_id, client_secret: app.client_secret, redirect_uri: redirect };
  await setJson(APPS_KEY, cache);
  return app;
}

export async function passwordSignIn(server: string, login: string, password: string) {
  const app = await appFor(server);
  const token = await new MastodonClient(server).token(app, {
    grant_type: 'password',
    username: login,
    password,
    scope: SCOPES,
  });
  return token.access_token;
}

export async function signUp(
  server: string,
  input: { username: string; email: string; password: string; locale: string },
) {
  const app = await appFor(server);
  const client = new MastodonClient(server);
  const appToken = await client.token(app, { grant_type: 'client_credentials', scope: SCOPES });
  const token = await client.withToken(appToken.access_token).register({ ...input, agreement: true });
  return token.access_token;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class SignInCancelled extends Error {}

/**
 * Signs in on the user's own server in the system browser: authorization
 * code with PKCE, so the password never passes through this app.
 */
export async function browserSignIn(server: string): Promise<string> {
  const app = await appFor(server);
  const verifier = base64Url(Crypto.getRandomBytes(32));
  const challenge = base64Url(
    new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new TextEncoder().encode(verifier))),
  );
  const state = base64Url(Crypto.getRandomBytes(16));
  const redirect = redirectUri();

  const url = new URL('/oauth/authorize', server);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: app.client_id,
    redirect_uri: redirect,
    scope: SCOPES,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString();

  const result = await WebBrowser.openAuthSessionAsync(url.href, redirect);
  if (result.type !== 'success') throw new SignInCancelled();

  const params = new URL(result.url).searchParams;
  if (params.get('state') !== state) throw new ApiError(0, 'Sign-in failed: the response did not match the request.');
  const error = params.get('error');
  if (error) throw new ApiError(0, error === 'access_denied' ? 'You denied access.' : (params.get('error_description') ?? error));
  const code = params.get('code');
  if (!code) throw new ApiError(0, 'Sign-in failed: no authorization code was returned.');

  const token = await new MastodonClient(server).token(app, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect,
    code_verifier: verifier,
  });
  return token.access_token;
}

export async function revoke(server: string, token: string) {
  const cache = (await getJson<AppCache>(APPS_KEY)) ?? {};
  const app = cache[server];
  if (app) await new MastodonClient(server).revoke(app, token);
}
