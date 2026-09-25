/**
 * Fediverse handles: `@user@domain`. The leading `@` is optional on input;
 * a bare `user` is resolved against the local domain.
 */
export interface Handle {
  username: string;
  domain: string;
}

// Mastodon-compatible: letters, digits and underscores, dots/dashes inside.
const USERNAME = /^[a-z0-9_](?:[a-z0-9_.-]*[a-z0-9_])?$/i;
const DOMAIN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?$/i;

export const USERNAME_MAX_LENGTH = 30;

export function isValidUsername(username: string): boolean {
  return username.length <= USERNAME_MAX_LENGTH && USERNAME.test(username);
}

export function isValidDomain(domain: string): boolean {
  return DOMAIN.test(domain);
}

/** Parses `@user@domain`, `user@domain`, or `user` (when `localDomain` is given). */
export function parseHandle(input: string, localDomain?: string): Handle | null {
  const trimmed = input.trim().replace(/^@/, "");
  const parts = trimmed.split("@");
  let username: string | undefined;
  let domain: string | undefined;
  if (parts.length === 1) {
    username = parts[0];
    domain = localDomain;
  } else if (parts.length === 2) {
    [username, domain] = parts;
  }
  if (!username || !domain) return null;
  if (!isValidUsername(username) || !isValidDomain(domain)) return null;
  return { username, domain: domain.toLowerCase() };
}

export function formatHandle({ username, domain }: Handle): string {
  return `@${username}@${domain}`;
}

/** The `acct:` URI used as a WebFinger resource. */
export function toAcctUri({ username, domain }: Handle): string {
  return `acct:${username}@${domain}`;
}
