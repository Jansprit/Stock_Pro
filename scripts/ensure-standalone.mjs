#!/usr/bin/env node
/**
 * npm prestart hook：確保 .next/standalone/server.js 存在
 *
 * 為什麼需要：
 *   1. 用戶可能 clone → npm install → npm start（沒先 build）
 *   2. 用戶可能 build 後又刪了 .next（rm -rf .next）
 *   3. .next/standalone/server.js 缺失時直接跑會 MODULE_NOT_FOUND，
 *      終端機只噴一行錯誤，使用者不知從何修
 *
 * 解法：偵測 standalone 不存在 → 自動 npm run build → 再啟動 server
 * （已存在則 no-op，不影響 CI）
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STANDALONE_SERVER = path.join(ROOT, '.next', 'standalone', 'server.js');

if (existsSync(STANDALONE_SERVER)) {
  // 一切就緒，直接 no-op
  process.exit(0);
}

console.warn('[prestart] .next/standalone/server.js not found.');
console.warn('[prestart] 自動執行 `npm run build` 修復（首次啟動會需要 ~30 秒）...');

const result = spawnSync('npm', ['run', 'build'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  console.error('[prestart] build failed. 請看上方錯誤訊息。');
  process.exit(1);
}

if (!existsSync(STANDALONE_SERVER)) {
  console.error('[prestart] build 完成但 .next/standalone/server.js 仍不存在（異常狀態）。');
  process.exit(1);
}

console.log('[prestart] ✓ build 完成，可以啟動 server');