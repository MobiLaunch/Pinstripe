/**
 * Domain model shared by the server and the app. These are API shapes, not
 * database rows: the server maps storage and remote ActivityPub objects to them.
 */

/** Mirrors the ActivityPub addressing options in the composer. */
export type Visibility = "public" | "unlisted" | "followers" | "direct";

/** Timelines offered by the Videos and Feed tabs. */
export type Timeline = "home" | "local" | "federated";

export interface ProfileField {
  name: string;
  value: string;
  /** Set when `value` links back to the profile with rel="me". */
  verifiedAt: string | null;
}

export interface Account {
  id: string;
  username: string;
  /** Domain of the home server; equals the local domain for local accounts. */
  domain: string;
  /** ActivityPub actor IRI. */
  uri: string;
  displayName: string;
  bio: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  fields: ProfileField[];
  bot: boolean;
  locked: boolean;
  discoverable: boolean;
  /** The author lets people save their videos (Pinstripe accounts only). */
  allowsVideoDownloads: boolean;
  createdAt: string;
  counts: { posts: number; following: number; followers: number } | null;
}

export interface MediaAttachment {
  id: string;
  kind: "video" | "image";
  url: string;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  /** Seconds; videos only. */
  duration: number | null;
  description: string;
  blurhash: string | null;
}

/**
 * A post is the unit of federation. A short video is a post whose first
 * attachment is a video; the Videos tab shows those, the Feed tab shows all.
 */
export interface Post {
  id: string;
  uri: string;
  account: Account;
  content: string;
  /** Content warning; when set, the content starts hidden. */
  spoiler: string;
  visibility: Visibility;
  media: MediaAttachment[];
  tags: string[];
  /** Accounts mentioned in the post. */
  mentions: Pick<Account, "id" | "username" | "domain">[];
  inReplyToId: string | null;
  /** When this is a boost, the boosted post. */
  reblog: Post | null;
  counts: { replies: number; boosts: number; favourites: number };
  /** People who watched it on the server answering; null where the server doesn't count. */
  views: number | null;
  viewer: { favourited: boolean; boosted: boolean } | null;
  createdAt: string;
}

export function isVideoPost(post: Post): boolean {
  return post.media[0]?.kind === "video";
}

/** Blue and Graphite are the iOS 6 look in two colours; Glass is the Liquid Glass look. */
export type Theme = "blue" | "graphite" | "glass";

/** Everything on the Settings screen that is stored per account. */
export interface AccountSettings {
  approveFollowers: boolean;
  listInDirectory: boolean;
  allowVideoDownloads: boolean;
  hideFollowerCounts: boolean;
  autoplayVideos: boolean;
  startMuted: boolean;
  saveDataOnCellular: boolean;
  theme: Theme;
  defaultVisibility: Visibility;
}

export const DEFAULT_SETTINGS: AccountSettings = {
  approveFollowers: false,
  listInDirectory: true,
  allowVideoDownloads: false,
  hideFollowerCounts: false,
  autoplayVideos: true,
  startMuted: false,
  saveDataOnCellular: true,
  theme: "blue",
  defaultVisibility: "public",
};

export const POST_MAX_LENGTH = 500;
export const BIO_MAX_LENGTH = 500;
export const PROFILE_FIELDS_MAX = 4;
