# Deploying Pinstripe

The server ships as one Docker image (`Dockerfile` at the repository root).
`deploy/compose.yaml` runs it with Postgres and Caddy, which serves HTTPS
with automatic certificates, or with a Cloudflare Tunnel instead. To
run it on a computer at home, see [home-hosting.md](home-hosting.md).

## First deploy

On a Linux machine with Docker, with DNS for your host (e.g.
`pinstripe.social`) pointing at it and ports 80 and 443 open:

```sh
git clone https://github.com/mobilaunch/pinstripe && cd pinstripe/deploy
cp .env.example .env    # set PINSTRIPE_HOST, POSTGRES_PASSWORD, SMTP_URL…
docker compose up -d --build
docker compose logs -f server   # "Pinstripe listening on :8000 as https://…"
```

Database migrations run every time the server starts.

Make yourself an admin once you've signed up in the app:

```sh
docker compose exec server node_modules/.bin/tsx src/cli/role.ts <username> admin
```

Then sign out and in again, and Settings → Moderation appears.

## Updating

```sh
git pull && docker compose up -d --build
```

## Settings

All in `deploy/.env` (see `.env.example`):

| Variable | |
| --- | --- |
| `PINSTRIPE_HOST` | The public host name. Don't change it after launch: it's in every account's address. |
| `POSTGRES_PASSWORD` | Any long random string. |
| `REGISTRATIONS` | `open` or `closed`. Sign-ups are also limited to 5 per address per hour. |
| `SMTP_URL`, `MAIL_FROM` | Email for confirmations and password resets. Without it, emails only appear in the server log. |
| `MEDIA_STORAGE` and `S3_*` | `local` keeps uploads in the `media` volume; `s3` uses any S3-compatible bucket, with `S3_PUBLIC_URL` (ideally a CDN) serving the files. |
| `EXPO_ACCESS_TOKEN` | Only if the Expo project requires authenticated pushes. |

## Backups

Everything that matters is in Postgres (and the `media` volume when using
local storage):

```sh
docker compose exec postgres pg_dump -U pinstripe pinstripe | gzip > pinstripe-$(date +%F).sql.gz
```

## Checks

- `GET /health` → `{"ok":true}`; the image also has a Docker health check.
- `GET /api/v2/instance` describes the server to Mastodon clients.
- `GET /.well-known/nodeinfo` for fediverse crawlers.

## Scaling notes

One server process is enough to start. Before running several, move the
in-memory limits (login, email and sign-up limits, the server-block
cache) to Postgres or Redis. Federation delivery already uses a Postgres
queue shared by every process.
