# ── Web build stage ────────────────────────────────────────────────────────
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS web-builder

RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/

RUN pnpm install --filter @agrolens/web... --frozen-lockfile

COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# contracts dist/ is dockerignored; build it from source before the web build.
RUN pnpm --filter @agrolens/contracts build
RUN pnpm --filter @agrolens/web build

# ── Mobile PWA (Flutter web) build stage ──────────────────────────────────
FROM debian:bookworm-slim AS mobile-web-builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git unzip xz-utils \
  && rm -rf /var/lib/apt/lists/*

# Flutter SDK pinned to the version apps/mobile is developed against.
ARG FLUTTER_VERSION=3.47.5
RUN curl -fsSL "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz" \
    | tar -xJ -C /opt \
  && git config --global --add safe.directory /opt/flutter \
  && /opt/flutter/bin/flutter --version

ENV PATH="/opt/flutter/bin:${PATH}"

WORKDIR /app/apps/mobile
COPY apps/mobile/ ./

# Drift's schema source and web runtime are built against the locked packages.
RUN flutter pub get
RUN dart run build_runner build
RUN bash tool/setup_web_sqlite.sh
RUN flutter build web --release --base-href /m/ --no-web-resources-cdn

# ── API build stage ────────────────────────────────────────────────────────
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS api-builder

RUN corepack enable

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/contracts/package.json ./packages/contracts/

RUN pnpm install --filter @agrolens/api... --frozen-lockfile

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# contracts dist/ is dockerignored; build it from source (api consumes it).
RUN pnpm --filter @agrolens/contracts build
RUN pnpm --filter @agrolens/api build

# ── Production stage ───────────────────────────────────────────────────────
FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS production

RUN corepack enable && apk add --no-cache tini

WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/contracts/package.json ./packages/contracts/

RUN pnpm install --prod --filter @agrolens/api... --frozen-lockfile

COPY --chown=node:node --from=api-builder /app/apps/api/dist ./apps/api/dist
COPY --chown=node:node --from=api-builder /app/apps/api/drizzle ./apps/api/drizzle
COPY --chown=node:node --from=api-builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --chown=node:node --from=api-builder /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --chown=node:node --from=web-builder /app/apps/web/dist/agrolens-web/browser ./apps/api/web
COPY --chown=node:node --from=mobile-web-builder /app/apps/mobile/build/web ./apps/api/web-mobile

WORKDIR /app/apps/api

USER node

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
