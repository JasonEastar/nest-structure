# syntax=docker/dockerfile:1.7
# c9_map — một image cho mọi instance (all-in-one, ADR-0006).
# Targets: dev (hot reload, mount ./src) · runtime (prod, chỉ dist + deps prod).

FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

# ---------- deps: cài đủ dev deps một lần, cache theo lockfile ----------
FROM base AS deps
ENV NODE_ENV=development
# lockfile do npm 11 trên máy dev ghi; npm 10 của image đọc khác → dùng đúng npm (chỉ stage deps/dev/build, runtime không có)
RUN npm install -g npm@11.9.0 --silent
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# ---------- dev: nest start --watch, src được mount từ host ----------
FROM deps AS dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------- build: biên dịch rồi bỏ dev deps ----------
FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- runtime: nhỏ, không root ----------
FROM base AS runtime
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/i18n ./i18n
COPY --from=build --chown=node:node /app/drizzle ./drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health/live >/dev/null || exit 1
CMD ["node", "--import", "./dist/instrument.js", "dist/main.js"]
# Migration: docker compose run --rm api node dist/migrate.js
