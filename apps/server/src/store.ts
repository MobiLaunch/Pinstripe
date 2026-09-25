import { exportJwk, generateCryptoKeyPair, importJwk } from "@fedify/fedify";
import { type AccountSettings, DEFAULT_SETTINGS, isValidUsername, type ProfileField } from "@pinstripe/core";

/** An account hosted on this server. Remote actors are never stored here. */
export interface LocalAccount {
  /** Stable internal id; also the ActivityPub actor identifier, so usernames can change. */
  id: string;
  username: string;
  displayName: string;
  bio: string;
  fields: ProfileField[];
  bot: boolean;
  createdAt: Date;
  settings: AccountSettings;
}

export type FollowState = "pending" | "accepted";

export interface RemoteFollower {
  actorUri: string;
  inboxUri: string;
  sharedInboxUri: string | null;
  /** IRI of the Follow activity, needed to Accept or Reject it later. */
  followActivityUri: string;
  state: FollowState;
}

/**
 * Persistence boundary for the server. The in-memory implementation lets the
 * federation layer be built and tested now; a Postgres implementation will
 * replace it without touching callers.
 */
export interface Store {
  createAccount(input: { username: string; displayName?: string }): Promise<LocalAccount>;
  getAccount(id: string): Promise<LocalAccount | null>;
  getAccountByUsername(username: string): Promise<LocalAccount | null>;
  countAccounts(): Promise<number>;
  getKeyPairs(accountId: string): Promise<CryptoKeyPair[]>;
  upsertFollower(accountId: string, follower: RemoteFollower): Promise<void>;
  removeFollower(accountId: string, actorUri: string): Promise<void>;
  listFollowers(accountId: string, state?: FollowState): Promise<RemoteFollower[]>;
}

export class InvalidUsernameError extends Error {
  constructor(username: string) {
    super(`Invalid username: ${username}`);
  }
}

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`Username taken: ${username}`);
  }
}

export type KeyAlgorithm = "RSASSA-PKCS1-v1_5" | "Ed25519";
export interface StoredKeyPair {
  algorithm: KeyAlgorithm;
  privateKey: JsonWebKey;
  publicKey: JsonWebKey;
}

// RSA for compatibility with Mastodon et al.; Ed25519 for Object Integrity Proofs.
// RSA comes first: Fedify advertises the first pair as the actor's publicKey.
export const KEY_ALGORITHMS: readonly KeyAlgorithm[] = ["RSASSA-PKCS1-v1_5", "Ed25519"];

export async function generateKeyPairs(): Promise<StoredKeyPair[]> {
  return Promise.all(
    KEY_ALGORITHMS.map(async (algorithm) => {
      const pair = await generateCryptoKeyPair(algorithm);
      return { algorithm, privateKey: await exportJwk(pair.privateKey), publicKey: await exportJwk(pair.publicKey) };
    }),
  );
}

export async function importKeyPairs(stored: StoredKeyPair[]): Promise<CryptoKeyPair[]> {
  const ordered = [...stored].sort((a, b) => KEY_ALGORITHMS.indexOf(a.algorithm) - KEY_ALGORITHMS.indexOf(b.algorithm));
  return Promise.all(
    ordered.map(async (p) => ({
      privateKey: await importJwk(p.privateKey, "private"),
      publicKey: await importJwk(p.publicKey, "public"),
    })),
  );
}

export function newAccount(username: string, displayName?: string): Omit<LocalAccount, "id" | "createdAt"> {
  if (!isValidUsername(username)) throw new InvalidUsernameError(username);
  return { username, displayName: displayName ?? username, bio: "", fields: [], bot: false, settings: { ...DEFAULT_SETTINGS } };
}

export class MemoryStore implements Store {
  #accounts = new Map<string, LocalAccount>();
  // Promises, so concurrent first requests share one generation.
  #keys = new Map<string, Promise<StoredKeyPair[]>>();
  #followers = new Map<string, Map<string, RemoteFollower>>();

  async createAccount({ username, displayName }: { username: string; displayName?: string }) {
    const fresh = newAccount(username, displayName);
    if (await this.getAccountByUsername(username)) throw new UsernameTakenError(username);
    const account: LocalAccount = { id: crypto.randomUUID(), createdAt: new Date(), ...fresh };
    this.#accounts.set(account.id, account);
    return account;
  }

  async getAccount(id: string) {
    return this.#accounts.get(id) ?? null;
  }

  async getAccountByUsername(username: string) {
    const needle = username.toLowerCase();
    for (const account of this.#accounts.values()) {
      if (account.username.toLowerCase() === needle) return account;
    }
    return null;
  }

  async countAccounts() {
    return this.#accounts.size;
  }

  async getKeyPairs(accountId: string) {
    let stored = this.#keys.get(accountId);
    if (!stored) this.#keys.set(accountId, (stored = generateKeyPairs()));
    return importKeyPairs(await stored);
  }

  async upsertFollower(accountId: string, follower: RemoteFollower) {
    let map = this.#followers.get(accountId);
    if (!map) this.#followers.set(accountId, (map = new Map()));
    map.set(follower.actorUri, follower);
  }

  async removeFollower(accountId: string, actorUri: string) {
    this.#followers.get(accountId)?.delete(actorUri);
  }

  async listFollowers(accountId: string, state?: FollowState) {
    const all = [...(this.#followers.get(accountId)?.values() ?? [])];
    return state ? all.filter((f) => f.state === state) : all;
  }
}
