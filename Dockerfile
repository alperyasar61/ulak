FROM node:20-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.13.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist-server/server/index.js"]
