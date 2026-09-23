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

WORKDIR /app/apps/api

USER node

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
