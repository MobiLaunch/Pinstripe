import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 256 random bits, URL-safe. Used for tokens, codes and client credentials. */
export function randomSecret(): string {
  return randomBytes(32).toString("base64url");
}

/** Secrets are stored as SHA-256 digests; they're high-entropy, so no salt is needed. */
export function digest(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** PKCE S256: BASE64URL(SHA256(verifier)). */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}
