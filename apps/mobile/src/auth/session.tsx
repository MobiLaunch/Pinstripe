import type { Account } from '@pinstripe/core';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { ApiError, MastodonClient, toAccount } from '@/api/mastodon';

import * as oauth from './oauth';
import { getJson, secureStorage, setJson } from './storage';

interface StoredSession {
  server: string;
  token: string;
  /** Last known profile, so the app opens instantly and works offline. */
  account: Account;
}

type State =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; server: string; token: string; account: Account; client: MastodonClient };

interface Auth {
  state: State;
  signInWithPassword(server: string, login: string, password: string): Promise<void>;
  signInWithBrowser(server: string): Promise<void>;
  signUp(server: string, input: { username: string; email: string; password: string; locale: string }): Promise<void>;
  signOut(): Promise<void>;
}

const SESSION_KEY = 'pinstripe.session';
const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const activate = useCallback(async (server: string, token: string) => {
    const client = new MastodonClient(server, token);
    const account = toAccount(await client.verifyCredentials(), server);
    await setJson(SESSION_KEY, { server, token, account } satisfies StoredSession);
    setState({ status: 'signedIn', server, token, account, client });
  }, []);

  // Restore the saved session straight away, then refresh the profile in the
  // background. Only a rejected token signs out; being offline doesn't.
  useEffect(() => {
    (async () => {
      const saved = await getJson<StoredSession>(SESSION_KEY);
      if (!saved?.account) return setState({ status: 'signedOut' });
      const { server, token, account } = saved;
      setState({ status: 'signedIn', server, token, account, client: new MastodonClient(server, token) });
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
      signOut: async () => {
        if (state.status === 'signedIn') {
          // Best effort: the token is forgotten locally either way.
          await oauth.revoke(state.server, state.token).catch(() => {});
        }
        await secureStorage.remove(SESSION_KEY);
        setState({ status: 'signedOut' });
      },
    }),
    [state, activate],
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
