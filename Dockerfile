# ULAK üretim imajı — yerel depolama + SQLite varsayılanı için Node 22+ gerekir.
FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

# Derleme bağımlılıkları için tam kurulum; imajda dev araçları kalmaması adına
# `pnpm prune --prod` sonrası yalnızca çalışma zamanı paketleri bırakılır.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build && pnpm prune --prod

ENV NODE_ENV=production
ENV PORT=3000
ENV ULAK_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000

# Root olmayan kullanıcı; /data volume'u bu kullanıcıya ait olmalıdır.
RUN mkdir -p /data && chown -R node:node /data
USER node

CMD ["node", "apps/backend/dist-server/src/index.js"]
