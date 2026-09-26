# Hosting Pinstripe at home

Pinstripe runs fine on a computer at home to start with. It needs:

- **An always-on machine.** A spare PC, mini PC or Mac mini is plenty:
  4 GB of RAM (8 GB is comfortable), a few CPU cores for video encoding,
  and an SSD with room for videos (each is up to about 200 MB before it's
  re-encoded, and usually much smaller after). Linux is simplest; Docker
  Desktop on macOS or Windows also works.
- **Docker** with Compose.
- **Upload speed.** Viewers download videos from you, so your *upload*
  speed is what counts. Check it at a speed test site: 100 Mbps up
  comfortably serves a few dozen people watching at once.

Then choose how the internet reaches the machine.

## Option A: open ports (recommended when your connection allows it)

Your router forwards web traffic to the machine, and Caddy (included)
gets an HTTPS certificate by itself. No upload limits, and no one else
in the middle.

1. **Check you have a real public IP.** Compare the "WAN" or "Internet"
   IP on your router's status page with what https://ifconfig.me shows.
   - Same: good.
   - Different, or the router's starts with `100.64`–`100.127`, `10.` or
     `192.168.`: your provider uses CGNAT, and ports can't be opened.
     Use option B, or ask the provider for a public IP (many do this
     for free or a small fee).
2. **Give the machine a fixed local address** (a DHCP reservation in the
   router), then **forward TCP ports 80 and 443** (and UDP 443) to it.
3. **Point the domain at your home.** At your registrar, set an `A`
   record for `pinstripe.social` to your public IP (and `AAAA` if you
   have IPv6).
   - Home IPs can change. If yours does, move the domain's DNS to
     Cloudflare (free) and add `ddns` to `COMPOSE_PROFILES`, with a
     `CLOUDFLARE_API_TOKEN` that can edit DNS. The record then follows
     your IP. Leave the record "DNS only" (grey cloud), not proxied:
     Cloudflare's proxy caps uploads at 100 MB.
4. In `deploy/.env`: `PINSTRIPE_HOST=pinstripe.social`,
   `COMPOSE_PROFILES=direct` (or `direct,ddns`), then
   `docker compose up -d --build` in `deploy/`.
5. Visit https://pinstripe.social/health. `{"ok":true}` means you're live.

## Option B: Cloudflare Tunnel (no open ports, works behind CGNAT)

A small program on your machine connects out to Cloudflare, and visitors
reach you through it. Your home IP stays hidden and nothing is opened on
the router.

1. Add `pinstripe.social` to a free Cloudflare account, and change the
   domain's nameservers at your registrar to the ones Cloudflare gives
   you.
2. In Cloudflare: **Zero Trust → Networks → Tunnels → Create a tunnel**
   (type "Cloudflared"). Copy the token it shows.
3. Add a **public hostname**: `pinstripe.social` → service
   `http://server:8000`.
4. In `deploy/.env`: `COMPOSE_PROFILES=tunnel` and `TUNNEL_TOKEN=…`,
   then `docker compose up -d --build`.

The catch: on Cloudflare's free plan, **each upload is limited to
100 MB**. A minute of 1080p from a phone is often 60–130 MB, so the
longest, sharpest videos would fail to upload. Cloudflare's terms also
discourage serving lots of video through the free plan. Both go away if
videos are stored in object storage (for example Cloudflare R2, with
`MEDIA_STORAGE=s3`) and the app uploads large files straight there. That
isn't built yet, so treat the tunnel as the fallback when ports can't be
opened.

## Things to know about running it at home

- **Downtime is survivable.** Other fediverse servers retry deliveries
  for a day or more, so a restart or short outage loses nothing. A
  long outage means posts from elsewhere stop arriving until you're back.
- **Back up.** Postgres holds everything (see [deploy.md](deploy.md)),
  plus the `media` volume when uploads are stored locally. Keep a copy
  off the machine.
- **Updates** are `git pull && docker compose up -d --build`.
- **Your provider's terms.** Some residential plans forbid running
  servers. It's rarely enforced for small sites, but worth checking.
- **Moving later** to a rented server is easy: copy the database and
  media, then point the domain's DNS at the new machine. Handles stay
  `@you@pinstripe.social`, because they belong to the domain, not the
  machine.

## Before launch

- Email: set `SMTP_URL`, or sign-up confirmations and password resets
  will only appear in the server log. Sending mail directly from a home
  IP doesn't work: providers reject it.
- Make yourself admin (see [deploy.md](deploy.md)).
- The app's release builds already point at `https://pinstripe.social`.
