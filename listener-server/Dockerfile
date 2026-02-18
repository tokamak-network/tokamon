# ── Build stage ──
FROM node:20-slim AS build

WORKDIR /app

# sqlite3 네이티브 모듈 빌드에 필요한 도구 설치
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# listener-server 의존성 설치
COPY listener-server/package.json listener-server/package-lock.json* listener-server/
RUN cd listener-server && npm install --omit=dev

# ── Runtime stage ──
FROM node:20-slim

WORKDIR /app

# sqlite3 런타임 라이브러리
RUN apt-get update && apt-get install -y libsqlite3-0 && rm -rf /var/lib/apt/lists/*

# 빌드 결과 복사
COPY --from=build /app/listener-server/node_modules listener-server/node_modules

# 소스 복사
COPY shared/ shared/
COPY listener-server/ listener-server/

# 시크릿 파일 제거 (이미지에 포함 방지)
RUN rm -f listener-server/.env listener-server/.env.* \
         listener-server/serviceAccountKey.json \
         listener-server/*.db listener-server/*.sqlite \
         listener-server/contract-address.json \
         listener-server/spot-metadata*.json \
         listener-server/last-block*.json

WORKDIR /app/listener-server

EXPOSE 8080

CMD ["node", "index.js"]
