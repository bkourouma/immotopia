# syntax=docker/dockerfile:1
#
# Build context is the REPOSITORY ROOT, not packages/api: the monorepo uses npm
# workspaces with a single lockfile at the root.
#   docker build -f packages/api/Dockerfile .
# docker-compose.yml already sets the context accordingly.

FROM node:20-alpine AS build
WORKDIR /repo

# OpenSSL is required by Prisma's query engine on Alpine.
RUN apk add --no-cache openssl

# Manifests first so the install layer is cached independently of the sources.
COPY package.json package-lock.json .npmrc ./
COPY packages/api/package.json packages/api/
COPY packages/tsconfig/package.json packages/tsconfig/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY apps/web/package.json apps/web/

# The web workspace is not needed in the API image.
RUN npm ci --ignore-scripts --workspace @immotopia/api --include-workspace-root

COPY packages/tsconfig packages/tsconfig
COPY packages/api/prisma packages/api/prisma
RUN npx prisma generate --schema packages/api/prisma/schema.prisma

COPY packages/api/tsconfig.json packages/api/
COPY packages/api/src packages/api/src
RUN npm run build -w @immotopia/api

RUN npm prune --omit=dev


FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=8001
# Uploads live on a volume, outside the deployment directory.
ENV UPLOADS_DIR=/data/uploads

COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/api/dist ./dist
COPY --from=build /repo/packages/api/prisma ./prisma
COPY --from=build /repo/packages/api/package.json ./package.json

RUN mkdir -p /data/uploads && chown -R node:node /data

USER node
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8001)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
