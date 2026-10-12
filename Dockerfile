# syntax=docker/dockerfile:1
# One image for everything: the server serves the API and the built web app.
# Build: docker build -t personengedaechtnis .
# Run:   docker run -p 3000:3000 -v pg-data:/data -e PUBLIC_URL=http://localhost:3000 personengedaechtnis

ARG NODE_VERSION=24
# The runtime is plain Alpine plus the node binary; both must use the same Alpine.
ARG ALPINE_VERSION=3.22

# --- Shared base: pnpm via Corepack, toolchain as fallback for native modules ---------
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base
WORKDIR /app
RUN apk add --no-cache python3 make g++ && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# --- Build web app and server bundle ------------------------------------------------
FROM base AS build
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY tsconfig.base.json tsconfig.json ./
COPY packages packages
COPY apps apps
RUN pnpm build

# --- Production dependencies of the server only ------------------------------------
FROM base AS deps
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @app/server
# better-sqlite3 ships the SQLite sources and binaries for every platform; keep ours.
RUN cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 \
    && rm -rf deps src \
    && find prebuilds -name '*.node' ! -name "linuxmusl-$(node -p process.arch).node" -delete

# --- Runtime: Alpine + node, no package managers ----------------------------------
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS node
FROM alpine:${ALPINE_VERSION} AS runtime
RUN apk add --no-cache libstdc++ libgcc \
    && addgroup -g 1000 node && adduser -u 1000 -G node -s /bin/sh -D node \
    && mkdir -p /data && chown node:node /data
COPY --from=node /usr/local/bin/node /usr/local/bin/node

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

WORKDIR /app/apps/server
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/server/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./
COPY --from=build /app/apps/server/drizzle ./drizzle
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/web/dist /app/apps/web/dist

USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
