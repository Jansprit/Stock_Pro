---
name: api-key-deploy
description: Use this skill when starting a long-lived production server process (Node, Python, Go, anything) and you need to inject API keys from a local .env file without (a) putting them in the command line / process arguments visible to other processes, (b) writing them to log files, or (c) using platform-specific environment export in bash. Covers PowerShell + .NET Process API for Windows, and shows the failures to avoid (Start-Process -Environment, inline export, .cmd file with set KEY=VAL).
metadata:
  type: reference
  source: Stock_Pro v0.5.4 start-sse.ps1
---

# Deploying API Keys: Don't Put Them Anywhere Visible

## The problem
You need to start `node server.js` (or any daemon) and it needs `AI_RELAY_API_KEY`, `FINNHUB_API_KEY`, etc. from `.env.local`. Every "obvious" approach leaks the keys somewhere:

| Approach | Why it fails |
|---|---|
| `AI_RELAY_API_KEY=xxx node server.js` (bash inline) | Keys visible in `/proc/<pid>/cmdline`, `wmic process get commandline`, shell history |
| `nohup node server.js > log &` then `export KEY=xxx` | Race condition; environment not always inherited by nohup child |
| `Start-Process -Environment @{KEY='xxx'} node` (PowerShell) | **Only works in PowerShell 7+** — fails silently on PS 5.1 (the Windows default) with "找不到名為 Environment 的參數" |
| Write `set KEY=xxx && node ...` to a `.cmd` or `.bat` | Key now lives in a file — readable by any process with file access, and the cmd is process arguments (`wmic` shows it) |
| Use `Environment.SetEnvironmentVariable` then `Start-Process` | Sets it in the **parent process only**; `Start-Process` does not inherit parent env by default in PowerShell |
| Persist to user-level env with `setx` | Pollutes the user's environment permanently; key survives in registry |

## The Windows fix: `[System.Diagnostics.Process]`

PowerShell 5.1 (default on Windows 10/11) cannot do `-Environment` on `Start-Process`. Use the .NET API directly:

```powershell
[System.Diagnostics.ProcessStartInfo]$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = 'node.exe'
$psi.Arguments = 'server.js'
$psi.WorkingDirectory = $workDir
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true
$psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8

# Inject env WITHOUT writing to any file
foreach ($k in $envVars.Keys) {
    $psi.EnvironmentVariables[$k] = $envVars[$k]
}

[System.Diagnostics.Process]$proc = New-Object System.Diagnostics.Process
$proc.StartInfo = $psi

# Async log pump (so log lines appear as the process emits them)
$outHandler = {
    if (-not [String]::IsNullOrEmpty($EventArgs.Data)) {
        Add-Content -Path $logFile -Value $EventArgs.Data
    }
}
$errHandler = $outHandler
Register-ObjectEvent -InputObject $proc -EventName 'OutputDataReceived' -Action $outHandler | Out-Null
Register-ObjectEvent -InputObject $proc -EventName 'ErrorDataReceived' -Action $errHandler | Out-Null

[void]$proc.Start()
$proc.BeginOutputReadLine()
$proc.BeginErrorReadLine()
Write-Host "node PID=$($proc.Id)"
```

**Why this works**:
- `EnvironmentVariables` is a `StringDictionary` that the .NET runtime writes directly into the new process's environment block at `CreateProcess` time
- No file is created
- The new process's `cmdline` is just `node.exe server.js` — no key visible
- The process's env block is in kernel memory, only readable by the process itself (or admin)

## Reading .env without exposing values

```powershell
$envFile = 'D:\path\.env.local'
$envVars = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
        $envVars[$matches[1].Trim()] = $matches[2].Trim()
    }
}
foreach ($k in $envVars.Keys) {
    $psi.EnvironmentVariables[$k] = $envVars[$k]
}
```

For logging, **only print names + length, never the value**:
```powershell
foreach ($k in $envVars.Keys) {
    Write-Host "  $k = <$($envVars[$k].Length) chars>"
}
```

## What if I want a wrapper .cmd anyway?

If you need a `.cmd` for cron-like scheduling, use it **only as a launcher that calls node directly with a separate env file**:
```cmd
@echo off
node -r dotenv/config server.js > log.txt 2>&1
```

The dotenv package reads .env at startup — no `set KEY=val` in the .cmd file, no env in process args.

## What if I'm on Linux/macOS?

Use `systemd` `EnvironmentFile=` directive in a unit file, or write env to a file with `chmod 600` and source it in a wrapper script:

```bash
#!/usr/bin/env bash
set -a
. /etc/myapp.env   # chmod 600, root-owned
set +a
exec node server.js
```

The `set -a` / `set +a` pair auto-exports all variables defined in the sourced file, but only into the current shell's environment — not into anyone else's. The `exec` replaces the shell with node, so the env block is in node's address space only.

## Detection: how do I know if my approach leaks?

After starting the server, check from another terminal:
```bash
# Linux/macOS
cat /proc/$(pgrep -f 'node server.js')/cmdline | tr '\0' ' '
# Should NOT show any KEY=VALUE patterns

# Windows
wmic process where "name='node.exe'" get commandline
# Should just show: node.exe server.js  (not the keys)
```

If keys appear, restart with one of the approaches above.

## Why this matters
Once a key is in `/proc/<pid>/cmdline` or visible via `wmic`, it's in process metadata that:
- Other users on the same machine can read (depending on OS permissions)
- Process monitoring tools log
- Crash dumps may include
- Shell history may have captured

Treat API keys like passwords: they go into process memory at exec time, not into command lines or files.
