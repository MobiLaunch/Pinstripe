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

On Windows (PowerShell), set the variables with `$env:` instead of `export`:

```powershell
$env:DATABASE_URL = "postgres://pinstripe:pinstripe@localhost:5432/pinstripe"
$env:TEST_DATABASE_URL = "postgres://pinstripe:pinstripe@localhost:5432/pinstripe_test"
```

They last until the window closes; `setx DATABASE_URL "…"` keeps them for new
windows. Docker Desktop must be running for `docker compose up -d`.

To use the app on a computer, press `w` in the `pnpm dev:mobile` terminal
(or open http://localhost:8081): it runs in the browser in a phone-width
column. http://localhost:8000 is the server's own read-only public page, not
the app.

On Android the app has its own look and layout: Material 3 Expressive in
your wallpaper's colours (Material You), laid out like classic Twitter with
TikTok-style videos: Home, Watch, Search and Notifications, and a drawer
behind your avatar. To preview it in the browser, open
http://localhost:8081/?android=1 (it's remembered; `?android=0` goes back).
Android needs a development build for its font and wallpaper colours.

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
| `REGISTRATIONS` | `open` | `closed` turns sign-up off |
| `TRUST_PROXY` | `false` | `true` behind a reverse proxy (client addresses from X-Forwarded-For) |
| `EXPO_ACCESS_TOKEN` | unset | Only if the Expo project requires authenticated pushes |

For production, see [docs/deploy.md](docs/deploy.md) (Docker, Postgres, HTTPS).

See [docs/product.md](docs/product.md) for what we're building and
[docs/architecture.md](docs/architecture.md) for how, including the roadmap.
