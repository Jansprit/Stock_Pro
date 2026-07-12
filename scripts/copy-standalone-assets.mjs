#!/usr/bin/env node
/**
 * 自動把 .next/static 與 public 複製進 .next/standalone
 *
 * 為什麼需要：
 *   Next.js `output: 'standalone'` 預設不會把 .next/static（chunks、css）、
 *   public/（靜態檔）打包進 standalone 資料夾。直接跑
 *   `node .next/standalone/server.js` 會回 HTML 但所有
 *   /_next/static/* 請求 500 → 頁面 JS 無法 hydrate → UI 不互動。
 *
 * 解法：build 完後自動把缺失的資產複製進去。
 *
 * 觸發時機：npm run build 跑完（透過 npm postbuild hook）
 * 冪等：執行多次結果一樣。
 */

import { cp, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const STANDALONE = path.join(ROOT, '.next', 'standalone');
const STANDALONE_NEXT = path.join(STANDALONE, '.next');
const SRC_STATIC = path.join(ROOT, '.next', 'static');
const SRC_PUBLIC = path.join(ROOT, 'public');

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function copyDir(src, dst) {
  if (!await exists(src)) {
    console.warn(`[postbuild] skip ${src} (not found)`);
    return;
  }
  await mkdir(dst, { recursive: true });
  await cp(src, dst, { recursive: true });
  console.log(`[postbuild] copied ${path.relative(ROOT, src)} → ${path.relative(ROOT, dst)}`);
}

async function main() {
  if (!await exists(STANDALONE)) {
    console.error('[postbuild] .next/standalone not found. Did `next build` fail?');
    process.exit(0); // 不阻擋 build，但提示
  }
  await copyDir(SRC_STATIC, path.join(STANDALONE_NEXT, 'static'));
  await copyDir(SRC_PUBLIC, path.join(STANDALONE, 'public'));
  console.log('[postbuild] standalone ready');
}

main().catch((e) => {
  console.error('[postbuild] error:', e.message);
  process.exit(1);
});