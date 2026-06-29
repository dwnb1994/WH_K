# Build from monorepo root: docker build -f apps/api/Dockerfile .
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/
COPY packages/validators/package.json packages/validators/

RUN npm ci --workspace=@warehouse/api --include-workspace-root

COPY packages/types packages/types
COPY packages/validators packages/validators
COPY apps/api apps/api

RUN npm run build -w @warehouse/api

# ── Runtime ─────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY packages/types/package.json packages/types/
COPY packages/validators/package.json packages/validators/

RUN npm ci --workspace=@warehouse/api --omit=dev --include-workspace-root

COPY --from=builder /app/apps/api/dist apps/api/dist
COPY apps/api/database apps/api/database
COPY apps/api/scripts apps/api/scripts
COPY apps/api/data apps/api/data

WORKDIR /app/apps/api

EXPOSE 8080

CMD ["node", "dist/main.js"]
