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

/** Moderation scopes, as in Mastodon. They only work for moderators and admins. */
const ADMIN = new Set([
  "admin:read",
  "admin:write",
  "admin:read:accounts",
  "admin:write:accounts",
  "admin:read:reports",
  "admin:write:reports",
]);

export const DEFAULT_SCOPES = "read";

export function isValidScope(scope: string): boolean {
  if (TOP_LEVEL.has(scope) || ADMIN.has(scope)) return true;
  const [parent, child, extra] = scope.split(":");
  return !!parent && !!child && extra === undefined && (GRANULAR[parent]?.includes(child) ?? false);
}

/** Splits a space-separated scope string; null if any scope is unknown. */
export function parseScopes(input: string | undefined | null, fallback = DEFAULT_SCOPES): string[] | null {
  const scopes = [...new Set((input?.trim() || fallback).split(/\s+/))];
  return scopes.every(isValidScope) ? scopes : null;
}

/** Does `granted` include `required`, directly or via a broader scope (`read` ⊇ `read:statuses`, `admin:read` ⊇ `admin:read:reports`)? */
export function hasScope(granted: readonly string[], required: string): boolean {
  const parts = required.split(":");
  for (let n = parts.length; n > 0; n--) {
    const scope = parts.slice(0, n).join(":");
    // "admin" alone isn't a scope.
    if (scope !== "admin" && granted.includes(scope)) return true;
  }
  return false;
}

/** Every requested scope must be covered by what the app registered for. */
export function scopesAllowed(requested: readonly string[], registered: readonly string[]): boolean {
  return requested.every((s) => hasScope(registered, s));
}
