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
  store.ts       Store interface + MemoryStore
```

- **Actor identifiers are account UUIDs**, not usernames: `/users/{uuid}`.
  WebFinger maps `acct:sam@host` → uuid via `mapHandle`, so handles can be
  renamed without breaking federation.
- Each account gets an RSA key (Mastodon-compatible HTTP Signatures) and an
  Ed25519 key (FEP-8b32 proofs).
- `Follow` is auto-accepted unless *Approve new followers* is on, in which
  case it is stored as `pending`. `Undo(Follow)` removes it.
- Bots are served as `Service` actors, everyone else as `Person`.

The client API lives under `/api/v1` and returns `@pinstripe/core` shapes. It
follows Mastodon's API naming where it can, so remote-account support and
third-party clients stay possible.

## What's intentionally temporary

- `MemoryStore`, `MemoryKvStore` and `InProcessMessageQueue`: state resets on
  restart. Next step is Postgres (Drizzle) for the store and
  `@fedify/postgres` for KV + queue.
- The mobile app renders fixtures (`src/data/fixtures.ts`) typed as core
  models; screens swap to API calls as endpoints land.

## Roadmap

1. **Persistence:** Postgres schema for accounts, follows, posts, media;
   migrations; docker-compose for local dev.
2. **Auth:** registration, password login, OAuth 2 (Mastodon-compatible) so the
   app, and later other clients, get tokens. Remote-server sign-in.
3. **Posts & federation out:** `Create(Note)` / `Create(Video)` to followers,
   outbox collection, `Like`, `Announce`, `Delete`, `Update(Person)`.
4. **Inbound content:** store remote posts from followed actors; Home / Local /
   Federated timelines.
5. **Video pipeline:** upload, transcode (ffmpeg → HLS), thumbnails,
   blurhash, object storage + CDN; player in the Videos tab (expo-video).
6. **Profile:** edit profile endpoint, avatar/banner upload, `rel="me"`
   field verification.
7. **Settings & safety:** settings endpoint, domain blocks, follow requests UI,
   reporting, moderation.
8. **Polish:** Graphite theme, barber-pole progress, gel pulse animation,
   sound credits, share sheet.

## Conventions

- `pnpm test` and `pnpm typecheck` must pass; CI runs both.
- Server code is ESM with explicit `.ts` import extensions.
- UI builds only from the primitives in `apps/mobile/src/components/aqua.tsx`
  and tokens in `src/theme/aqua.ts`, never ad-hoc gradients.
