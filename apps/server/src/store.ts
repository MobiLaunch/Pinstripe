import { exportJwk, generateCryptoKeyPair, importJwk } from "@fedify/fedify";
import { type AccountSettings, DEFAULT_SETTINGS, type ProfileField, isValidUsername } from "@pinstripe/core";

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

export class MemoryStore implements Store {
  #accounts = new Map<string, LocalAccount>();
  #keys = new Map<string, { privateKey: JsonWebKey; publicKey: JsonWebKey }[]>();
  #followers = new Map<string, Map<string, RemoteFollower>>();

  async createAccount({ username, displayName }: { username: string; displayName?: string }) {
    if (!isValidUsername(username)) throw new Error(`Invalid username: ${username}`);
    if (await this.getAccountByUsername(username)) throw new Error(`Username taken: ${username}`);
    const account: LocalAccount = {
      id: crypto.randomUUID(),
      username,
      displayName: displayName ?? username,
      bio: "",
      fields: [],
      bot: false,
      createdAt: new Date(),
      settings: { ...DEFAULT_SETTINGS },
    };
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
    if (!stored) {
      // RSA for compatibility with Mastodon et al.; Ed25519 for Object Integrity Proofs.
      const pairs = await Promise.all([
        generateCryptoKeyPair("RSASSA-PKCS1-v1_5"),
        generateCryptoKeyPair("Ed25519"),
      ]);
      stored = await Promise.all(
        pairs.map(async (p) => ({ privateKey: await exportJwk(p.privateKey), publicKey: await exportJwk(p.publicKey) })),
      );
      this.#keys.set(accountId, stored);
    }
    return Promise.all(
      stored.map(async (p) => ({
        privateKey: await importJwk(p.privateKey, "private"),
        publicKey: await importJwk(p.publicKey, "public"),
      })),
    );
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
