# Pinstripe

Short videos for the fediverse, dressed in Aqua.

Pinstripe is a short-form video app (swipeable, full-screen clips) that speaks
ActivityPub, so a `@you@pinstripe.social` account can be followed from
Mastodon, Pixelfed, Misskey and anything else on the fediverse. The look is a
deliberate throwback to early Mac OS X: pinstripes, brushed metal and gel buttons.

## Layout

| Path             | What                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| `apps/mobile`    | Expo (React Native) app: Feed ← Videos → Account pager, auth, settings. |
| `apps/server`    | ActivityPub server: Hono + [Fedify](https://fedify.dev).                |
| `packages/core`  | Shared domain model and fediverse helpers used by both.                 |
| `docs/`          | Product brief and architecture notes.                                   |

## Getting started

Requires Node 22+ and pnpm 10 (`corepack enable`).

```sh
pnpm install
pnpm test          # all packages
pnpm typecheck

# Postgres (or skip it: without DATABASE_URL the server keeps data in memory)
docker compose up -d
export DATABASE_URL=postgres://pinstripe:pinstripe@localhost:5432/pinstripe
export TEST_DATABASE_URL=postgres://pinstripe:pinstripe@localhost:5432/pinstripe_test

# server on http://localhost:8000 with a seeded @sam account
PINSTRIPE_SEED_ACCOUNT=sam pnpm dev:server
curl -H 'accept: application/activity+json' \
  'http://localhost:8000/.well-known/webfinger?resource=acct:sam@localhost:8000'

# app (Expo dev server; press i / a / w)
pnpm dev:mobile
```

See [docs/product.md](docs/product.md) for what we're building and
[docs/architecture.md](docs/architecture.md) for how, including the roadmap.
