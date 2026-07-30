FROM node:22-bookworm-slim AS builder

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages packages

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api

RUN pnpm --filter ./apps/api build


FROM node:22-bookworm-slim

RUN corepack enable

WORKDIR /app

COPY --from=builder /app /app

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["pnpm", "--filter", "./apps/api", "start"]