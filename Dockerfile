FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV DB_DIR=/app/data
ENV PORT=3457

RUN mkdir -p /app/data

EXPOSE 3457

CMD ["node", "src/server.js"]
