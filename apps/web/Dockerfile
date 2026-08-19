# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Document Hub Web — production image
#
# Vite embeds VITE_* variables at BUILD time, not at container start — so
# this image must be (re)built whenever VITE_API_BASE_URL changes for a
# given deployment. There is no runtime env injection here; that's a
# deliberate simplicity choice for v0.1.0-rc.1 (see docs/deployment.md).
# Never pass secrets as VITE_* — anything embedded here ships to every
# browser that loads the app.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS build
WORKDIR /repo

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
# See apps/api/Dockerfile's identical retry loop — real ECONNRESET
# failures during `npm ci` (a sub-dependency's own binary download, not
# npm's own package fetch, so npm's fetch-retries config can't help)
# seen on this project's own Linux host validation.
RUN set -e; for i in 1 2 3 4; do npm ci && exit 0; echo "npm ci failed (attempt $i/5), retrying in 10s..."; sleep 10; done; npm ci

COPY apps/web apps/web

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build --workspace apps/web

# ---- runtime ----------------------------------------------------------
FROM nginx:1.27-alpine AS runtime

RUN addgroup -S documenthub && adduser -S documenthub -G documenthub \
  && rm -f /etc/nginx/conf.d/default.conf

COPY apps/web/nginx.conf /etc/nginx/conf.d/documenthub.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html

# nginx:alpine's stock image already runs its master process as root by
# design (it binds port 80, then workers drop privilege) — no further user
# switch needed here; see nginx.conf's `user nginx;` directive.

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=5s --retries=10 --start-period=5s \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
