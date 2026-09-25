import type { Account, Visibility } from '@pinstripe/core';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ApiError, fromMastodonVisibility, type MastodonCredentialAccount, MastodonClient, toAccount } from '@/api/mastodon';

import * as oauth from './oauth';
import { getJson, secureStorage, setJson } from './storage';

interface StoredSession {
  server: string;
  token: string;
  /** Last known profile, so the app opens instantly and works offline. */
  account: Account;
  source: Source;
}

/** The editable side of the signed-in account (Mastodon's `source`). */
export interface Source {
  /** Plain-text bio, as typed. */
  note: string;
  defaultVisibility: Visibility;
  followRequests: number;
  /** Can see and act on reports (a moderator or admin). */
  moderator?: boolean;
}

type State =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; server: string; token: string; account: Account; source: Source; client: MastodonClient };

function sourceOf(json: MastodonCredentialAccount): Source {
  return {
    note: json.source?.note ?? '',
    defaultVisibility: fromMastodonVisibility(json.source?.privacy ?? 'public'),
    followRequests: json.source?.follow_requests_count ?? 0,
    moderator: !!json.role?.name && /moderator|admin|owner/i.test(json.role.name),
  };
}

interface Auth {
  state: State;
  signInWithPassword(server: string, login: string, password: string): Promise<void>;
  signInWithBrowser(server: string): Promise<void>;
  signUp(server: string, input: { username: string; email: string; password: string; locale: string }): Promise<void>;
  signOut(): Promise<void>;
  /** Re-reads the signed-in profile (counts, bio) from the server. */
  refreshAccount(): Promise<void>;
  /** Uses an account the server just returned (e.g. after editing the profile). */
  applyCredentials(json: MastodonCredentialAccount): Promise<void>;
}

const SESSION_KEY = 'pinstripe.session';
const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const save = useCallback(async (server: string, token: string, json: MastodonCredentialAccount) => {
    const account = toAccount(json, server);
    const source = sourceOf(json);
    await setJson(SESSION_KEY, { server, token, account, source } satisfies StoredSession);
    // Keep the same client while the login is unchanged: lists reload when it changes.
    setState((prev) => ({
      status: 'signedIn',
      server,
      token,
      account,
      source,
      client: prev.status === 'signedIn' && prev.server === server && prev.token === token ? prev.client : new MastodonClient(server, token),
    }));
  }, []);

  const activate = useCallback(
    async (server: string, token: string) => save(server, token, await new MastodonClient(server, token).verifyCredentials()),
    [save],
  );

  // Restore the saved session straight away, then refresh the profile in the
  // background. Only a rejected token signs out; being offline doesn't.
  useEffect(() => {
    (async () => {
      const saved = await getJson<StoredSession>(SESSION_KEY);
      if (!saved?.account) return setState({ status: 'signedOut' });
      const { server, token, account } = saved;
      const source = saved.source ?? { note: account.bio, defaultVisibility: 'public', followRequests: 0 };
      setState({ status: 'signedIn', server, token, account, source, client: new MastodonClient(server, token) });
      try {
        await activate(server, token);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          await secureStorage.remove(SESSION_KEY);
          setState({ status: 'signedOut' });
        }
      }
    })();
  }, [activate]);

  const auth = useMemo<Auth>(
    () => ({
      state,
      signInWithPassword: async (server, login, password) =>
        activate(server, await oauth.passwordSignIn(server, login, password)),
      signInWithBrowser: async (server) => activate(server, await oauth.browserSignIn(server)),
      signUp: async (server, input) => activate(server, await oauth.signUp(server, input)),
      refreshAccount: async () => {
        if (state.status !== 'signedIn') return;
        await activate(state.server, state.token).catch(() => {});
      },
      applyCredentials: async (json) => {
        if (state.status === 'signedIn') await save(state.server, state.token, json);
      },
      signOut: async () => {
        if (state.status === 'signedIn') {
          // Best effort: the token is forgotten locally either way.
          await oauth.revoke(state.server, state.token).catch(() => {});
        }
        await secureStorage.remove(SESSION_KEY);
        setState({ status: 'signedOut' });
      },
    }),
    [state, activate, save],
  );

  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}

/** The signed-in account. Only for screens behind the signed-in guard. */
export function useAccount(): Account {
  const { state } = useAuth();
  if (state.status !== 'signedIn') throw new Error('useAccount needs a signed-in session');
  return state.account;
}

/** The signed-in account's editable settings. Only for screens behind the signed-in guard. */
export function useSource(): Source {
  const { state } = useAuth();
  if (state.status !== 'signedIn') throw new Error('useSource needs a signed-in session');
  return state.source;
}
