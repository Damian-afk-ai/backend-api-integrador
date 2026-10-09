FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-bookworm-slim
ARG COMMIT_SHA=local
ENV COMMIT_SHA=$COMMIT_SHA
ENV NODE_ENV=production PORT=3000 DB_PATH=/app/storage/data.db
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package*.json index.js database.js schemas.js ./
RUN mkdir -p storage backups && chown -R node:node storage backups
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=15s --retries=6 CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "index.js"]
