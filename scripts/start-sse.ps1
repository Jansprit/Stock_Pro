$envFile = 'D:\Claude Code Work Space\Stock_Pro\.env.local'
$envVars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') { $envVars[$matches[1].Trim()] = $matches[2].Trim() }
}

# 注入到目前 process 的 env
foreach ($k in $envVars.Keys) {
  [System.Environment]::SetEnvironmentVariable($k, $envVars[$k], 'Process')
}

# 印出 env 變數名清單（不印值）
Write-Host "=== Env vars loaded (names only, values redacted) ==="
$envVars.Keys | ForEach-Object {
  $val = $envVars[$_]
  $len = $val.Length
  Write-Host "  $_ = <$len chars>"
}

$logFile = 'C:\Users\user\AppData\Local\Temp\prod-sse.log'
$workDir = 'D:\Claude Code Work Space\Stock_Pro\.next\standalone'

# 寫 .cmd 注入 env（這是 server 啟動用的 .cmd，不會被 git 或 shell 看到 key 字串）
# .cmd 放在 %TEMP% 用完可刪
$cmdFile = Join-Path $env:TEMP ('start-sse-' + (Get-Random) + '.cmd')
$cmdContent = "@echo off`r`n"
$cmdContent += "cd /d `"$workDir`"`r`n"
foreach ($k in $envVars.Keys) {
  $v = $envVars[$k]
  # escape: cmd special chars ^ & | < > ( )
  $v = $v -replace '([&|<>^()])', '^$1'
  $cmdContent += "set `"$k=$v`"`r`n"
}
$cmdContent += "node server.js > `"$logFile`" 2>&1`r`n"
[System.IO.File]::WriteAllText($cmdFile, $cmdContent, [System.Text.Encoding]::ASCII)
Write-Host "cmdFile: $cmdFile (auto-cleanup on script end)"

$proc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $cmdFile -WindowStyle Hidden -PassThru
Write-Host "launcher PID=$($proc.Id)"

$ready = $false
for ($i = 1; $i -le 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -eq 200) { Write-Host "ready after ${i}s"; $ready = $true; break }
  } catch {}
}
if (-not $ready) { Write-Host 'NOT ready'; exit 1 }
