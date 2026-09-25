# The Pinstripe server. Build from the repository root:
#   docker build -t pinstripe .
# See deploy/ for running it with Postgres and HTTPS.

FROM node:22-bookworm-slim AS build
WORKDIR /src
RUN corepack enable
COPY . .
# A standalone copy of the server with only its production dependencies
# (and @pinstripe/core), without the app's. The ffmpeg/ffprobe binaries
# come with @ffmpeg-installer, allowed to install in package.json.
RUN pnpm install --frozen-lockfile --filter "@pinstripe/server..." \
 && pnpm --filter @pinstripe/server deploy --prod --legacy /out

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=8000 \
    MEDIA_DIR=/data/media
WORKDIR /app
COPY --from=build /out ./
# The server's tsconfig extends ../../tsconfig.base.json.
COPY tsconfig.base.json /tsconfig.base.json
RUN mkdir -p /data/media && chown -R node:node /data
USER node
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Migrations run on start.
CMD ["node_modules/.bin/tsx", "src/main.ts"]
