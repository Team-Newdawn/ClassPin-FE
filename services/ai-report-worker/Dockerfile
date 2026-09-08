# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5 AS deps
WORKDIR /worker
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim@sha256:83f487e0a63425e5b4d146fb5e5be574bcbe1b7b843d3ebafdd95eaf7767a7e5
WORKDIR /worker
RUN apt-get update && apt-get install -y --no-install-recommends \
      tesseract-ocr=5.3.0-2 \
      tesseract-ocr-eng=1:4.1.0-2 \
      tesseract-ocr-kor=1:4.1.0-2 \
      imagemagick-6.q16=8:6.9.11.60+dfsg-1.6+deb12u13 \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PORT=8080 HOME=/tmp
COPY --from=deps /worker/node_modules ./node_modules
COPY src ./src
USER node
EXPOSE 8080
CMD ["node", "src/server.mjs"]
