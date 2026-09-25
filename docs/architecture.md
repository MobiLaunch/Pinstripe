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
  store.ts       Store interface + MemoryStore (tests, no-database dev)
  pg-store.ts    PostgresStore
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

### Persistence

With `DATABASE_URL` set, the server uses Postgres for everything: accounts,
keys and followers through Drizzle (`PostgresStore`), and Fedify's cache and
delivery queue through `@fedify/postgres`. Pending migrations run at
startup. Without it, everything is in memory.

- Change `src/db/schema.ts`, then `pnpm --filter @pinstripe/server db:generate`
  to write a migration into `apps/server/drizzle/`. Commit both.
- `store.test.ts` runs one contract against every `Store`; Postgres is
  included when `TEST_DATABASE_URL` is set (CI sets it). It truncates that
  database.
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

## What's intentionally temporary

- The mobile app renders fixtures (`src/data/fixtures.ts`) typed as core
  models; screens swap to API calls as endpoints land.

## Roadmap

1. ~~**Persistence:** Postgres for accounts, keys, followers, Fedify KV and
   queue; migrations; docker-compose.~~ Done.
2. **Auth:** registration, password login, OAuth 2 in Mastodon's shape so the
   app gets tokens the same way from Pinstripe or any Mastodon server.
3. **Posts & federation out:** `/api/v1/statuses`, `Create(Note)` /
   `Create(Video)` to followers, outbox, `Like`, `Announce`, `Delete`,
   `Update(Person)`.
4. **Inbound content:** store remote posts from followed actors; Home / Local /
   Federated timelines.
5. **Video pipeline:** `/api/v2/media` upload enforcing the limits, transcode
   (ffmpeg → HLS), thumbnails, blurhash, object storage + CDN; player in the
   Videos tab (expo-video).
6. **Profile:** `update_credentials`, avatar/banner upload, `rel="me"`
   verification.
7. **Settings & safety:** settings endpoint, domain blocks, follow requests UI,
   reporting, moderation.
8. **Polish:** Graphite theme, barber-pole progress, gel pulse animation,
   sound credits, share sheet.

## Conventions

- `pnpm test` and `pnpm typecheck` must pass; CI runs both.
- Server code is ESM with explicit `.ts` import extensions.
- UI builds only from the primitives in `apps/mobile/src/components/aqua.tsx`
  and tokens in `src/theme/aqua.ts`, never ad-hoc gradients.
