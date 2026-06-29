# Build from monorepo root: docker build -f apps/web/Dockerfile .
FROM node:20-alpine AS builder

WORKDIR /app

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_USE_MOCK=0

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_USE_MOCK=$NEXT_PUBLIC_USE_MOCK

COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
COPY packages/types/package.json packages/types/

RUN npm ci --workspace=@warehouse/web --include-workspace-root

COPY packages/types packages/types
COPY packages/api-client packages/api-client
COPY apps/web apps/web

RUN npm run build -w @warehouse/web

FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

WORKDIR /app/apps/web

EXPOSE 8080

CMD ["node", "server.js"]
