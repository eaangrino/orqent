FROM node:24-bookworm-slim

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

COPY package.json pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile=false

COPY tsconfig.json ./
COPY src ./src
COPY test ./test
COPY README.md LICENSE ./

RUN pnpm build

ENTRYPOINT ["node", "dist/src/index.js"]
