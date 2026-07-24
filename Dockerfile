# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# 1) 의존성 설치
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# 2) 빌드
#    NEXT_PUBLIC_* 값은 클라이언트 번들에 그대로 박히므로 런타임 env 로는
#    늦는다. 반드시 build arg 로 받아야 브라우저에서 Supabase 가 붙는다.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_DATA_MODE
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_DATA_MODE=$NEXT_PUBLIC_DATA_MODE \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# 3) 실행
#    app/api/convert/route.ts 가 soffice(PPT→PDF) 와 pdftoppm(PDF→JPEG) 을
#    직접 실행한다. 한글 폰트가 없으면 PPT 변환 결과에서 글자가 깨진다.
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-impress \
      poppler-utils \
      fonts-nanum \
      fonts-nanum-coding \
      fonts-noto-cjk \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && fc-cache -f

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    HOME=/tmp

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Supabase 미설정 시의 로컬 폴백 경로. 배포 환경에서는 쓰이지 않는다.
RUN mkdir -p /app/public/generated

EXPOSE 3000
CMD ["node", "server.js"]
