/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Playwright + chromium-bidi 必須在 server runtime 載入，避免 webpack 打包
  experimental: {
    serverComponentsExternalPackages: ['playwright-core', 'playwright'],
  },
};

module.exports = nextConfig;