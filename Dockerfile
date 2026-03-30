FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ─── Production stage ───
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

RUN groupadd -r personalfi && useradd -r -g personalfi -m personalfi

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/
COPY public/ ./public/

RUN mkdir -p /app/data && chown -R personalfi:personalfi /app

USER personalfi

ENV NODE_ENV=production
ENV DB_DIR=/app/data
ENV PORT=3457

EXPOSE 3457

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3457/api/health/live || exit 1

CMD ["node", "src/server.js"]
