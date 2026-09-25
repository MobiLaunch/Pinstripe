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

# Postgres (required by the server and its tests)
docker compose up -d
export DATABASE_URL=postgres://pinstripe:pinstripe@localhost:5432/pinstripe
export TEST_DATABASE_URL=postgres://pinstripe:pinstripe@localhost:5432/pinstripe_test

pnpm test          # all packages
pnpm typecheck

# server on http://localhost:8000
pnpm dev:server

# app (Expo dev server; press i / a / w). Create an account from the app,
# or sign in with any Mastodon account via "Use an account on another server".
pnpm dev:mobile
```

In development, emails (confirmation and password-reset links) are printed
in the server's output. To make yourself a moderator:
`pnpm --filter @pinstripe/server role <username> moderator`, then sign in again.

Server settings, all optional in development:

| Variable | Default | |
| --- | --- | --- |
| `PINSTRIPE_ORIGIN` | `http://localhost:8000` | Public URL, e.g. `https://pinstripe.social` |
| `MEDIA_STORAGE` | `local` | `s3` for any S3-compatible bucket (see docs/architecture.md) |
| `MEDIA_DIR` | `./media-data` | Where uploads go when local |
| `SMTP_URL` | unset (print to console) | e.g. `smtp://user:pass@smtp.example.com:587` |
| `MAIL_FROM` | `Pinstripe <noreply@host>` | |

See [docs/product.md](docs/product.md) for what we're building and
[docs/architecture.md](docs/architecture.md) for how, including the roadmap.
