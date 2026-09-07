# syntax=docker/dockerfile:1

# Build stage: install every dependency, generate the Prisma client, compile TS.
FROM node:20-alpine AS build
WORKDIR /app

# OpenSSL is required by Prisma's query engine on Alpine.
RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune to production dependencies for the runtime image.
RUN npm prune --omit=dev


# Runtime stage
FROM node:20-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache openssl

ENV NODE_ENV=production
ENV PORT=8001
# Uploads live on a volume, outside the deployment directory.
ENV UPLOADS_DIR=/data/uploads

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./

RUN mkdir -p /data/uploads && chown -R node:node /data

USER node
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8001)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]
