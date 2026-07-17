---
name: nextjs-windows-build
description: Use this skill whenever a Next.js project fails to build on Windows — particularly when the build hangs at the "Compiling" or "Collecting build traces" stage with stable CPU/memory, when swc cache appears empty, when working on a D: drive (or any non-C: drive), or when `output: 'standalone'` builds fail intermittently. Covers the manual swc binary fix, cache surgery, and the "build doesn't actually fail — it just hangs forever" trap.
metadata:
  type: reference
  source: Stock_Pro v0.5.3→v0.5.4 debug
---

# Next.js Build on Windows: The Swc D-Drive Trap

## Symptom
`next build` starts, prints banner + "Environments: .env.local", then **silently hangs** at "Compiling" or "Collecting build traces". CPU stays low (~1-2%), WorkingSet stuck at ~93MB, no errors, no exit. Process sometimes appears to die after 3-5 minutes; sometimes it eventually finishes; sometimes it hangs until you kill it.

This is **not** a memory leak, not a missing dep, not slow TypeScript. It's the swc native binary failing to load on non-C: drives.

## Root cause
[vercel/next.js#67541](https://github.com/vercel/next.js/issues/67541): on Windows, when the project lives on a non-system drive (D:, E:, etc.), swc's child-process bootstrap can't resolve the binary path correctly during the "copy native binary into `.next/cache/swc/plugins/`" step. The build doesn't crash — it just hangs forever waiting for a binary that never finishes copying.

## Diagnosis (5 seconds)
Check if the swc cache is empty or half-populated:

```bash
ls .next/cache/swc/plugins/ 2>&1
# If output is empty or only contains an empty v7_windows_x86_64_<version>/ subdir → swc cache is broken
```

If the directory exists but is empty, swc is hung trying to populate it.

## The fix (proven)
Manually copy the swc binary from `node_modules` into the cache. Next.js will then pick it up on the next build and skip the broken copy step:

```bash
# 1. Find the binary
ls node_modules/@next/swc-win32-x64-msvc/next-swc.win32-x64-msvc.node
# (file is ~130MB)

# 2. Create the cache dir (version string must match!)
mkdir -p .next/cache/swc/plugins/v7_windows_x86_64_0.106.15

# 3. Copy it
cp node_modules/@next/swc-win32-x64-msvc/next-swc.win32-x64-msvc.node \
   .next/cache/swc/plugins/v7_windows_x86_64_0.106.15/

# 4. Verify
ls -la .next/cache/swc/plugins/v7_windows_x86_64_0.106.15/
# Should show ~130MB .node file
```

Then `npm run build` normally — it should complete in 90-120s.

## Critical gotchas

### 1. **DO NOT delete `.next/cache/swc/` to "fix it"**
This makes things worse. The empty directory is a sign the copy failed once; deleting it forces the broken copy step to retry and hang again. Only `rm -rf .next/cache/swc/plugins/v7_windows_x86_64_*/` (the version dir, not the whole swc tree) is safe before manually re-copying.

### 2. **The swc cache survives across builds when intact**
Once manually seeded, subsequent builds use the cached binary. Don't re-`rm -rf` between builds unless you have evidence it's broken.

### 3. **Server lock on `.next/standalone/` blocks `rm -rf`**
If a previous `node .next/standalone/server.js` is still running, the OS will block `rm -rf .next/standalone` with "Device or resource busy". Kill the process first:
```bash
# Find owner of port 3000
powershell -Command "Get-NetTCPConnection -LocalPort 3000 | ForEach-Object { Stop-Process -Id \$_.OwningProcess -Force }"
```

### 4. **Build will not show errors when it hangs**
swc doesn't fail loudly. It just sits there. Don't wait 10+ minutes hoping for an error — set a 100-120s expectation and if no route table appears in the log, kill it and check swc cache.

### 5. **TypeScript strict mode catches more than you expect**
Every `setState({...})` literal must include ALL required fields. If you add a new field to an interface, every setState literal using that type fails the build. Use `?:` for optional or initialize to a sensible default in every site.

## What works reliably
- **Cold start on C: drive** — usually fine, no swc issue
- **Warm build on D: drive with manual binary seed** — 90-120s, reliable
- **Build on Linux/macOS** — never have this problem
- **GitHub Actions Linux runner** — fine (Stock_Pro's release.yml uses this)

## What doesn't work
- `rm -rf .next/cache` to "clean and retry" — re-triggers the bug
- `rm -rf .node_modules/.cache` — swc uses `.next/cache` not `.node_modules/.cache`
- `npm cache clean --force` — unrelated to swc
- Switching to babel-loader — possible but adds a new dep + slower builds

## When to escalate
If after manual binary seed the build still hangs:
1. Check if `node_modules/@next/swc-*/` exists at all (someone may have run `pnpm install --prod` and skipped it)
2. Check antivirus — Windows Defender can quarantine the swc binary
3. Check `next.config.js` for `experimental.serverComponentsExternalPackages` — incompatible with some swc versions
4. Last resort: upgrade Next.js to 15.x (the issue may be fixed there)
