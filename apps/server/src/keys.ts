import { exportJwk, generateCryptoKeyPair, importJwk } from "@fedify/fedify";

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
