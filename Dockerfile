# Tokamon - Multi-stage Docker build
# Stage 1: Build contracts (Foundry)
FROM ghcr.io/foundry-rs/foundry:latest AS contracts-builder
WORKDIR /build

COPY contracts/ ./contracts/
COPY lib/ ./lib/
WORKDIR /build/contracts
RUN forge build

# Stage 2: Build client
FROM node:20-alpine AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm ci --omit=dev

COPY client/ ./
RUN npm run build

# Stage 3: Production server
FROM node:20-alpine
WORKDIR /app

# Server dependencies
COPY server/package*.json ./server/
RUN npm ci --prefix server --omit=dev

COPY server/ ./server/
COPY --from=contracts-builder /build/contracts/out ./contracts/out
COPY --from=client-builder /app/client/dist ./client/dist

# contract-address.json, .env 는 런타임에 볼륨 마운트
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "server/index.js"]
