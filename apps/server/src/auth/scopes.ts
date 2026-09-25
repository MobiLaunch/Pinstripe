/**
 * OAuth scopes, following Mastodon: top-level `read`, `write`, `follow`,
 * `push`, `profile`, plus granular `read:accounts`, `write:statuses`, etc.
 * A top-level scope covers all of its granular ones.
 */

const TOP_LEVEL = new Set(["read", "write", "follow", "push", "profile"]);

const GRANULAR: Record<string, readonly string[]> = {
  read: ["accounts", "blocks", "bookmarks", "favourites", "filters", "follows", "lists", "mutes", "notifications", "search", "statuses"],
  write: [
    "accounts",
    "blocks",
    "bookmarks",
    "conversations",
    "favourites",
    "filters",
    "follows",
    "lists",
    "media",
    "mutes",
    "notifications",
    "reports",
    "statuses",
  ],
};

export const DEFAULT_SCOPES = "read";

export function isValidScope(scope: string): boolean {
  if (TOP_LEVEL.has(scope)) return true;
  const [parent, child] = scope.split(":");
  return !!parent && !!child && (GRANULAR[parent]?.includes(child) ?? false);
}

/** Splits a space-separated scope string; null if any scope is unknown. */
export function parseScopes(input: string | undefined | null, fallback = DEFAULT_SCOPES): string[] | null {
  const scopes = [...new Set((input?.trim() || fallback).split(/\s+/))];
  return scopes.every(isValidScope) ? scopes : null;
}

/** Does `granted` include `required`, directly or via its top-level parent? */
export function hasScope(granted: readonly string[], required: string): boolean {
  if (granted.includes(required)) return true;
  const parent = required.split(":")[0]!;
  return parent !== required && granted.includes(parent);
}

/** Every requested scope must be covered by what the app registered for. */
export function scopesAllowed(requested: readonly string[], registered: readonly string[]): boolean {
  return requested.every((s) => hasScope(registered, s));
}
