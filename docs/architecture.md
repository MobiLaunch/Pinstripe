# Architecture

## Stack

- **pnpm workspace, TypeScript everywhere.** One language across app, server
  and shared model. `node-linker=hoisted` (in `.npmrc`) keeps React Native and
  Metro happy.
- **`packages/core`**: API shapes (`Account`, `Post`, `MediaAttachment`,
  `AccountSettings`, …) and fediverse helpers (handle parsing/formatting).
  No runtime dependencies; consumed as TypeScript source.
- **`apps/server`**: [Hono](https://hono.dev) for HTTP, [Fedify](https://fedify.dev)
  for ActivityPub (WebFinger, NodeInfo, actors, HTTP Signatures, Object
  Integrity Proofs, inbox/outbox queues). Run with `tsx`.
- **`apps/mobile`**: Expo SDK 57 + expo-router. The main screens use
  `expo-router/js-top-tabs` with a bottom tab bar, so Feed ← Videos → Account
  can be swiped as in the design. Aqua visuals come from
  `expo-linear-gradient` and `react-native-svg`.

## Server shape

```
src/
  main.ts        wiring: config, store, federation, HTTP listener
  config.ts      env → Config
  federation.ts  Fedify: actor, key pairs, followers, inbox listeners, NodeInfo
  app.ts         Hono: Fedify middleware first, then /api/v1 client routes
  store.ts       Store: accounts, keys, followers
  keys.ts        signing key generation and import
  mastodon.ts    Mastodon API serializers
  ids.ts         UUIDv7 (time-ordered ids for posts)
  http.ts        request parsing and Link-header paging shared by the routes
  auth/          OAuth 2, sign-up, sessions (see below)
  accounts/      follows, search, relationships, profile and settings editing
  statuses/      posting, timelines, threads, and their ActivityPub side
  remote/        other servers: fetching actors, storing their posts, sanitizing, delivery
  db/            Drizzle schema + connection; migrations live in ../drizzle
```

- **Actor identifiers are account UUIDs**, not usernames: `/users/{uuid}`.
  WebFinger maps `acct:sam@host` → uuid via `mapHandle`, so handles can be
  renamed without breaking federation.
- Each account gets an RSA key (Mastodon-compatible HTTP Signatures) and an
  Ed25519 key (FEP-8b32 proofs).
- `Follow` is auto-accepted unless *Approve new followers* is on, in which
  case it is stored as `pending`. `Undo(Follow)` removes it.
- Bots are served as `Service` actors, everyone else as `Person`.

### Federation

- **One accounts table** for local accounts (`domain` null) and remote ones
  we've seen. Remote profiles are fetched with Fedify, their HTML sanitized
  (`remote/sanitize.ts`), and refreshed at most daily when looked up again.
  Remote follower/post counts are what their server reported.
- **Follows** (`follows` table) cover both directions. Following a remote
  account sends `Follow` and stays a request until their `Accept`; remote
  follows of a locked local account wait in Follow Requests and are
  answered with `Accept` or `Reject`.
- **Incoming**: the inbox handles Create, Update, Delete, Announce, Like,
  Undo, Accept and Reject. Remote posts are stored only if relevant: the
  author is followed here, they mention a local account, or they reply to a
  post we have. Boosts of our own posts are always recorded.
- **Outgoing** (`remote/deliver.ts`): a local post goes to the author's
  remote followers (unless direct), everyone mentioned, and the author of
  the post it replies to. Likes and boosts of remote posts go to their
  author. Profile edits go to followers as `Update(Person)`.
- **Visibility** is one SQL rule (`visibleTo` in `statuses/store.ts`):
  public and unlisted for everyone, followers-only for accepted followers,
  and any post for the accounts it mentions.
- Handle lookups (`@user@server`) use WebFinger over HTTPS. For local
  multi-server development, `PINSTRIPE_ALLOW_PRIVATE_ADDRESS=true` lets
  servers on localhost fetch each other, and search accepts profile URLs.
- `federation.test.ts` runs two real Pinstripe servers, each with its own
  database (`TEST_DATABASE_URL` and the same name plus `_b`), federating
  over HTTP.

### Persistence

Postgres holds everything: accounts, keys, followers and auth through
Drizzle, and Fedify's cache and delivery queue through `@fedify/postgres`.
`DATABASE_URL` is required; pending migrations run at startup.

- Change `src/db/schema.ts`, then `pnpm --filter @pinstripe/server db:generate`
  to write a migration into `apps/server/drizzle/`. Commit both.
- Tests need `TEST_DATABASE_URL` (CI provides it). They migrate it once,
  truncate it between tests and run files one at a time, so never point it
  at real data.
- Local Postgres: `docker compose up -d` (creates `pinstripe` and
  `pinstripe_test`).

### Client API: Mastodon-compatible

The app signs in either to Pinstripe or to any Mastodon-compatible server, so
it is written as a **Mastodon API client**, and the Pinstripe server
implements the subset of the Mastodon API the app uses (`/api/v1/...`,
`/api/v2/media`, OAuth 2 at `/oauth/...`) with the same JSON shapes. One client
talks to both, and third-party Mastodon apps work against Pinstripe for free.
`@pinstripe/core` types are what the app works with internally; a thin
mapping layer converts from Mastodon JSON.

Pinstripe-only features (video-first timelines, sound credits) are added as
extra fields or extra endpoints, never by changing Mastodon's shapes.

### Auth

Mastodon's OAuth 2 flavour, so the app (and any Mastodon client) signs in the
same way everywhere:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/apps` | Register a client; returns `client_id`/`client_secret` once. |
| `GET/POST /oauth/authorize` | Server-rendered sign-in + consent page. Authorization code, PKCE S256. |
| `POST /oauth/token` | `authorization_code`, `password`, `client_credentials`. |
| `POST /oauth/revoke` | Revoke a token (only by the app it was issued to). |
| `POST /api/v1/accounts` | Sign up; needs an app token with `write:accounts`. |
| `GET /api/v1/accounts/verify_credentials` | The signed-in account plus `source`. |

- Passwords: scrypt (N=2^15, r=8), parameters stored with the hash so they
  can be raised. Unknown users are checked against a dummy hash, so timing
  doesn't reveal which usernames exist.
- Tokens, codes and client secrets are random 256-bit values stored only as
  SHA-256 digests. Codes live 10 minutes and are deleted on first use,
  successful or not.
- Scopes follow Mastodon (`read`, `write`, `follow`, `push`, `profile`, and
  granular `read:accounts` etc.); a top-level scope covers its children.
- 10 failed logins per username/email per 15 minutes, then that login is
  locked out for the rest of the window. In process memory for now.
- The authorize page never redirects to a URI the app didn't register, is
  not frameable, and sends no scripts.
- The API allows any origin (CORS `*`): it's bearer-token only, no cookies.

**How the app signs in**

- *Pinstripe account:* native form → `password` grant against
  `EXPO_PUBLIC_PINSTRIPE_SERVER`.
- *Sign up:* `client_credentials` app token → `POST /api/v1/accounts`.
- *Another server:* the system browser opens that server's
  `/oauth/authorize` (authorization code + PKCE) and returns to
  `pinstripe://oauth`, so the app never sees that password. Works against
  Mastodon and against Pinstripe itself.
- The token and per-server client credentials are kept in the Keychain /
  Keystore via expo-secure-store (localStorage on web). The last-known
  profile is cached with the session, so the app opens instantly and
  offline; only a 401 signs out.

Email and password (Pinstripe's own endpoints; Mastodon does these on web pages):

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/pinstripe/account` | `{ email, confirmed }` |
| `POST /api/v1/pinstripe/account/password` | Needs the current password; signs out other sessions. |
| `POST /api/v1/pinstripe/account/email` | Needs the current password; sends a confirmation link. |
| `POST /api/v1/pinstripe/account/confirmation` | Sends the link again. |
| `POST /api/v1/pinstripe/password_reset` | Emails a one-hour reset link; the same answer whether or not the address exists. |
| `GET /auth/password/edit`, `POST /auth/password` | The reset page the link opens (server-rendered, works without the app). |
| `GET /auth/confirmation` | Confirms an address. |

- Links are one-time tokens stored as digests (`email_tokens`). A reset
  signs out every session and also confirms the address.
- Mail goes through `SMTP_URL` (any provider) from `MAIL_FROM`. Without
  `SMTP_URL`, messages are printed to the server log, which is how you
  get links in development.
- At most 5 emails per address per hour (in memory, like the login
  limiter).
- Confirmation isn't required to use the app yet.

Not yet: signup rate limiting / CAPTCHA, a moderation approval mode.

### Posts

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/statuses` | Post (500 characters; emoji count as one). |
| `GET / DELETE /api/v1/statuses/:id` | Read; delete returns `text` for redrafting. |
| `POST /api/v1/statuses/:id/{favourite,unfavourite,reblog,unreblog}` | |
| `GET /api/v1/accounts/:id/statuses` | A profile's posts and boosts. |
| `GET /api/v1/timelines/home` | Your posts and boosts (followed accounts join once following exists). |
| `GET /api/v1/timelines/public` | Public posts; `?local=true` for Local. No boosts. |

- Post ids are UUIDv7, so id order is time order and `max_id` / `min_id` /
  `since_id` paging and the `Link` header work as Mastodon clients expect.
- Text is escaped, then URLs, `#hashtags` and local `@mentions` become links
  (`statuses/content.ts`). Remote mentions need a WebFinger lookup and come
  with inbound federation.
- Visibility: public and unlisted posts are visible to anyone;
  followers-only and direct posts only to their author until following and
  mention delivery exist.
- Boosts are status rows pointing at the original (`reblog_of_id`), one per
  account. Deleting a post deletes its boosts and favourites.
- ActivityPub: each public/unlisted post is a `Note` at
  `/users/{id}/statuses/{id}`; the actor links an outbox of `Create` and
  `Announce` activities. Posting, boosting, unboosting and deleting send
  `Create`, `Announce`, `Undo` and `Delete` to accepted followers through
  Fedify's queue, signed with the author's key. Nothing is sent for direct
  posts or for accounts with no followers.

In the app, `usePostList` backs every list (Feed timelines, Account tabs)
with paging, pull-to-refresh and optimistic favourites/boosts. Changes are
broadcast to every mounted list, because the swipeable tabs stay mounted
and would otherwise show stale copies.

### Notifications

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/notifications` | Paged, newest first; `types[]`, `exclude_types[]`, `account_id`. |
| `GET /api/v1/notifications/:id`, `POST …/:id/dismiss`, `POST …/clear` | |
| `GET /api/v1/notifications/unread_count` | Newer than the read marker (Mastodon 4.3). |
| `GET / POST /api/v1/markers` | Read position for `notifications` and `home`, shared across devices. |

- Types: `follow`, `follow_request`, `favourite`, `reblog`, `mention`
  (which covers replies: the replied-to author is notified even without an
  @mention).
- Notifications are written where the thing itself is stored (`Store.follow`,
  `StatusStore.favourite`, `reblog`, `create`, `upsertRemote`), so local
  actions and ones arriving from other servers behave the same. Only local
  recipients get them, never for your own actions, and a redelivered
  activity doesn't notify twice.
- Undoing removes the notification: boosts and mentions through the status
  cascade, unfollows, unfavourites and answered requests explicitly.
- The app polls the unread count (on focus, on return to the foreground and
  every minute) for the badge on Feed's bell. Push notifications are still
  to come.

### Safety and moderation

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v1/accounts/:id/{block,unblock,mute,unmute}` | Mute takes `notifications` and `duration`. |
| `GET /api/v1/blocks`, `GET /api/v1/mutes` | |
| `GET / POST / DELETE /api/v1/domain_blocks` | "Blocked servers", per account. |
| `POST /api/v1/reports` | To this server's moderators. |
| `GET /api/v1/admin/reports`, `…/:id`, `…/:id/{resolve,reopen}` | Moderators and admins, with `admin:*` scopes. |
| `POST /api/v1/admin/accounts/:id/action` (`suspend`), `…/unsuspend` | |

- What's hidden is decided in one place, `safety/sql.ts`, used by every
  timeline, thread and notification query:
  - **Block:** follows end both ways, and neither side can follow again.
    Each is hidden from the other's timelines and notifications. The
    blocked person can't open, favourite or reply to the blocker's posts.
  - **Mute:** posts are hidden from timelines and threads but still show
    on the profile. Notifications are hidden unless
    `notifications=false`. Mutes can expire.
  - **Server block:** everyone on that server is hidden, follows with them
    end both ways, and new follows from there are rejected.
  - **Suspension:** the account's posts are hidden from everyone, and its
    login and tokens stop working.
- Federation: blocking a remote account sends `Block` (and `Undo` to lift
  it), plus an `Undo(Follow)` or `Reject(Follow)` for any follows it
  ended. Incoming `Block`s are stored, so the blocker disappears for the
  blocked person here. Incoming `Flag`s become reports.
- **Server-wide:** moderators can limit or suspend an account, or a whole
  server (`/api/v1/admin/domain_blocks`):
  - *Limit* (Mastodon's "silence") keeps it out of public and hashtag
    timelines, and out of the notifications of anyone who doesn't follow
    it. Followers still see everything.
  - *Suspend* on a server refuses its actors and activities (they're
    never stored or fetched), sends nothing there, removes every follow
    with it, and hides what was already stored.
  - Server blocks are listed publicly at `/api/v1/instance/domain_blocks`,
    with the public reason, and cached in memory for a minute.
- Every moderator action goes in `moderation_log`
  (`/api/v1/pinstripe/admin/log`). In the app, Settings → Moderation has
  Reports, Servers and Log tabs.
- Roles live on `users.role` (`user`, `moderator`, `admin`). Set them with
  `pnpm --filter @pinstripe/server role <username> <role>`. The app asks
  Pinstripe's own server (and only it) for the admin scopes, and shows
  Settings → Reports to moderators.
- Reports about remote accounts can be forwarded (`forward`) to their
  server as a `Flag`. The Flag comes from the **instance actor**
  (`/users/instance`, an `Application` whose handle is the server's host,
  as on Mastodon), so the reporter isn't revealed. Its keys live in
  Fedify's key-value store.

### Media

| Endpoint | Purpose |
| --- | --- |
| `POST /api/v2/media` | Upload a photo or video (multipart `file`, optional `description`). 200 when ready, 202 while a video processes. |
| `GET /api/v1/media/:id` | 206 while processing, 200 when ready, 422 if processing failed. |
| `PUT /api/v1/media/:id` | Change the description before posting. |
| `PATCH /api/v1/accounts/update_credentials` | Also takes `avatar` / `header` files. |
| `GET /media/*` | Files, when stored on local disk (supports Range for video seeking). |

- Uploads stream to a temp file (busboy) and are cut off at the size limit
  with a 413, so a 2 GB file never reaches memory or disk in full.
- **Photos** (`media/process.ts`, sharp): rotated upright, EXIF/GPS
  stripped, fit within 1920 px, a 640 px preview and a blurhash. Done in
  the request.
- **Videos** (ffprobe + ffmpeg): checked against the limits (duration,
  1080p either way, rotation taken into account), re-encoded to H.264/AAC MP4
  with `faststart` and no metadata, plus a poster frame and blurhash. Done
  one at a time in the background; the ffmpeg/ffprobe binaries come from
  `@ffmpeg-installer` (`FFMPEG_PATH` / `FFPROBE_PATH` override).
- Posts take `media_ids`: up to four photos, or one video on its own, all
  ready, owned by the poster and not already used. `only_media` and the
  Pinstripe `only_video` filter work on timelines; the Videos tab uses
  `only_video`.
- **Storage** (`media/storage.ts`) is an interface with two backends:
  `LocalDiskStorage` for development (`MEDIA_DIR`, default `./media-data`)
  and `S3Storage` for anything S3-compatible (AWS, Cloudflare R2, Backblaze,
  MinIO): set `MEDIA_STORAGE=s3` plus `S3_BUCKET`, `S3_REGION`,
  `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`,
  `S3_PUBLIC_URL` (the CDN or bucket URL files are served from) and
  optionally `S3_FORCE_PATH_STYLE=true`.
- An hourly sweep deletes uploads never attached to a post after 24 hours
  and marks processing stuck for an hour as failed. Deleting a post deletes
  its files.
- ActivityPub: attachments go out as `Document`s with `mediaType`, size,
  blurhash and `name` (alt text); remote attachments are stored as links to
  the origin server, not copied.

In the app, `api/upload.ts` checks the limits before sending (same code as
the server, from `packages/core`), uploads with progress over XHR and polls
until processing is done. The Videos tab is a vertical pager over
`only_video` timelines: the visible video plays (following the autoplay and
start-muted settings), the rest pause, and everything pauses when another
tab is showing. The record orb opens the camera or library (60 s max) and
then `new-video`, which uploads while the caption is written.

### Profiles and playback

- **Link verification:** after profile fields change, each `http(s)` field
  is fetched in the background (`accounts/verify-links.ts`). If the page
  has an `<a>` or `<link>` with `rel="me"` pointing at the profile (or the
  actor), the field gets `verified_at`, which shows as the green check.
  Fetching is limited to public addresses (unless
  `PINSTRIPE_ALLOW_PRIVATE_ADDRESS`), three redirects each re-checked,
  5 s and 1 MB. A link that doesn't change keeps its check.
- **Views:** `POST /api/v1/pinstripe/statuses/:id/view` counts a
  signed-in person once per video. The app sends it after 2 s of
  playback. Statuses carry `pinstripe.views_count`, which other clients
  ignore.
- **Downloads:** accounts carry `pinstripe.allow_video_downloads` from
  Settings. The app offers Save only when it's on (or for your own
  videos). The files are public either way, so this is a courtesy, as on
  other video apps, not access control.
- **Save data on cellular:** stops autoplay while on mobile data
  (expo-network). Videos still play when tapped.
- The Videos rail offers Follow (+) on the author's avatar. Profiles show
  videos as a 3-column grid of posters with view counts, and tapping one
  opens a full-screen player of that account's videos.

### Web pages

People following a Pinstripe link from elsewhere get a readable page
(`web/`), server-rendered with no scripts and built from the same
Mastodon JSON a signed-out client sees:

- `/`: the server's latest public posts.
- `/@user`: profile and public posts. Link fields carry `rel="me"`, so
  other sites can verify links back.
- `/@user/:id`: a post and its replies, with Open Graph tags for link
  previews (the video too).
- `/tags/:name`: public posts with a hashtag.

ActivityPub clients asking for `/@user` or `/@user/:id` are redirected to
the actor or Note, and browsers opening `/users/…` are sent to the page.

### Appearance

Blue and Graphite differ only in the accent, as in Mac OS X: gel buttons,
active orbs, the selected segment and tab, avatars, the profile banner,
progress bars, switches and selection outlines. `theme/theme.tsx` provides
it through `useAccent()`, and the Aqua primitives read it, so screens
rarely need to. The choice is saved on the device (so it applies before
the network answers, and on servers without Pinstripe preferences). On
Pinstripe it's also saved with the account and followed on sign-in.

## What's intentionally temporary

- Login lockouts live in process memory.
- Video is served as one progressive MP4. An HLS ladder
  (1080p/720p/480p) is the next step once there's real traffic; the
  storage interface doesn't need to change for it.

## Roadmap

1. ~~**Persistence:** Postgres for accounts, keys, followers, Fedify KV and
   queue; migrations; docker-compose.~~ Done.
2. ~~**Auth:** registration, password login, OAuth 2 in Mastodon's shape so the
   app gets tokens the same way from Pinstripe or any Mastodon server.~~ Done.
3. ~~**Posts & federation out:** `/api/v1/statuses`, `Create(Note)` to
   followers, outbox, `Announce`, `Delete`, `Update(Person)`, `Like`.~~ Done.
4. ~~**Following & inbound content:** follows both ways with requests,
   remote posts in Home and Federated, mentions, replies and threads,
   search.~~ Done.
5. ~~**Video pipeline:** `/api/v2/media` upload enforcing the limits,
   transcode, thumbnails, blurhash, object storage; player in the Videos
   tab.~~ Done. Still to do: HLS ladder, CDN in front of the bucket.
6. ~~**Profile:** `update_credentials`, avatar/banner upload, `rel="me"`
   verification, video grid with views~~ Done.
7. **Settings & safety:** ~~settings endpoint, follow requests~~ (done);
   ~~notifications, blocks and mutes, domain blocks, reporting, basic
   moderation, report forwarding, server-wide blocks, moderation log~~
   (done). Still to do: push notifications.
8. **Polish:** ~~Graphite theme, barber-pole progress, share sheet~~ (done);
   gel pulse animation, sound credits.

## Conventions

- `pnpm test` and `pnpm typecheck` must pass; CI runs both.
- Server code is ESM with explicit `.ts` import extensions.
- UI builds only from the primitives in `apps/mobile/src/components/aqua.tsx`
  and tokens in `src/theme/aqua.ts`, never ad-hoc gradients.
