# ===== Stock_Pro production Dockerfile =====
#
# 設計重點：
# 1. Multi-stage build — 只把 production artifacts 帶到 final image
# 2. Playwright Chromium — Next.js 內部用 playwright 爬 Goodinfo.tw JS challenge
#    需要 system libs + chromium binary
# 3. Standalone output — 用 Next.js `output: 'standalone'` 把依賴壓成單一資料夾
# 4. Non-root user — 不要用 root 跑 node
# 5. Healthcheck — 確保 container 健康

# ============ Stage 1: deps ============
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Playwright 需要的 system libs（在 build stage 一次裝好）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
    libgcc-s1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
    libxss1 libxtst6 lsb-release wget xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

# Playwright Chromium（base image 已含 system libs，這裡只裝 browser binary）
RUN npx playwright install --with-deps chromium

# ============ Stage 2: builder ============
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# 從 deps stage 複製已裝好的 node_modules + Playwright 瀏覽器
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /root/.cache/ms-playwright /root/.cache/ms-playwright

COPY . .

# CI 提供 placeholder env，避免 build-time 讀不到 key 失敗
ENV AI_RELAY_BASE_URL=https://your-ai-relay.example.com \
    AI_RELAY_MODEL=MiniMax-M2.7 \
    AI_RELAY_API_KEY=ci-placeholder-key \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ============ Stage 3: runner ============
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    # Playwright 預設找瀏覽器的路徑
    PLAYWRIGHT_BROWSERS_PATH=/root/.cache/ms-playwright

# Playwright 需要的 system libs（runner 也需要，因為 Goodinfo scraper 在 runtime 用）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 \
    libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 \
    libgcc-s1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 \
    libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 \
    libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
    libxss1 libxtst6 dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=deps --chown=nextjs:nodejs /root/.cache/ms-playwright /root/.cache/ms-playwright

USER nextjs

EXPOSE 3000

# Healthcheck — 確保 server 真的啟動了（不是 crash 後還活著）
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/search?q=AAPL', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# dumb-init 處理 zombie processes / signal forwarding
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]