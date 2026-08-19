# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Document Hub API — production image
#
# Three stages: install dependencies once, build the compiled output, then
# copy only the production artifacts (dist/, generated Prisma client,
# production node_modules) into a minimal runtime image. The runtime image
# never contains the TypeScript source, tests, dev dependencies, or this
# repo's local .env files (see .dockerignore).
#
# Build stage and runtime stage share the same base image family (both
# node:20-alpine) on purpose — Prisma's query engine is a native binary
# resolved for the exact OS/libc it was generated under; mixing bases here
# would silently produce a runtime-incompatible engine.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS base
# Prisma's engine binaries need OpenSSL present on Alpine (musl) — without
# this, `prisma generate`/the generated client fail at runtime with an
# "Unable to require libquery_engine" error.
RUN apk add --no-cache openssl
WORKDIR /repo

# ---- dependencies -----------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

# ---- build --------------------------------------------------------------
FROM deps AS build
COPY apps/api apps/api
RUN npm run prisma:generate --workspace apps/api \
  && npm run build --workspace apps/api

# Production-only node_modules — a second, separate install so the runtime
# image never carries devDependencies (ts-node, jest, eslint, ...). Both
# workspace package.json files must be present for `npm ci` to accept the
# root lockfile, even though only apps/api's deps end up installed.
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root

# ---- migrate --------------------------------------------------------------
# A separate, short-lived target for `prisma migrate deploy` only. Reuses
# the `build` stage (full devDependencies, including the prisma CLI, which
# the pruned runtime image deliberately excludes) rather than duplicating an
# install. docker-compose runs this as a one-shot service that must exit 0
# before the api service starts — migrations always run before the app that
# depends on their result, never as an implicit side effect of app boot.
FROM build AS migrate
CMD ["npm", "run", "prisma:deploy", "--workspace", "apps/api"]

# ---- runtime --------------------------------------------------------------
FROM node:20-alpine AS runtime
RUN apk add --no-cache openssl curl \
  && addgroup -S documenthub && adduser -S documenthub -G documenthub
WORKDIR /app

ENV NODE_ENV=production

COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
# The generated Prisma client engine (@prisma/client itself is already in
# node_modules via prod-deps — this is just the generated .prisma/client
# artifact, which only the `build` stage's `prisma generate` produced).
COPY --from=build /repo/node_modules/.prisma ./node_modules/.prisma
COPY apps/api/prisma ./prisma
COPY apps/api/package.json ./package.json

# Storage root for the local filesystem driver — a named volume is mounted
# here in docker-compose.yml so uploaded files survive container restarts.
RUN mkdir -p /app/storage && chown -R documenthub:documenthub /app
USER documenthub

EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=10s \
  CMD curl -f http://localhost:3000/health/live || exit 1

CMD ["node", "dist/src/main.js"]
