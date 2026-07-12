/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Playwright + chromium-bidi 必須在 server runtime 載入，避免 webpack 打包
  experimental: {
    serverComponentsExternalPackages: ['playwright-core', 'playwright'],
  },
  // 啟用 standalone output：build 後產生 .next/standalone/，
  // 只含 runtime 需要的 node_modules（不含 devDependencies）+ .next/server
  // Docker COPY 時 image 從 ~1GB 縮到 ~200MB
  output: 'standalone',
  // 不暴露 build-time env 到 client（防止 API key 等機密外洩到瀏覽器 bundle）
  // 設成空 prefix，意思是只暴露 NEXT_PUBLIC_* 開頭的變數
  env: {},
};

module.exports = nextConfig;