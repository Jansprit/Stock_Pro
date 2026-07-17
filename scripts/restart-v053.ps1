# 將 v0.5.3 standalone 切換成 production server
# 此 script 會：
#   1. 列出所有 node.exe process（含 PID）讓 user 看到現況
#   2. 殺掉目前在跑 standalone server.js 的 process
#   3. 等 2 秒（OS 釋放 file lock）
#   4. 確認 .next/standalone/ 內容已是 v0.5.3（page-2087c462a34cca38.js）
#   5. 啟動新 server（從 .env.local 自動讀 AI_RELAY_* 環境變數；不需寫在命令列）
#   6. 等 5 秒，curl 驗證 homepage + AI 報告

# === 1. 看現況 ===
Write-Host '=== 目前跑 standalone server 的 process ==='
Get-CimInstance Win32_Process -Filter 'Name="node.exe"' |
  Where-Object { $_.CommandLine -like '*standalone*server.js*' } |
  Select-Object ProcessId, StartTime, @{n='Cmd';e={ $_.CommandLine.Substring(0, [Math]::Min(80, $_.CommandLine.Length)) }} |
  Format-Table -AutoSize -Wrap

# === 2. 殺掉舊 server ===
Write-Host '=== 殺掉舊 server ==='
Get-CimInstance Win32_Process -Filter 'Name="node.exe"' |
  Where-Object { $_.CommandLine -like '*standalone*server.js*' } |
  ForEach-Object { Write-Host "Stopping PID $($_.ProcessId)"; Stop-Process -Id $_.ProcessId -Force }

Start-Sleep -Seconds 2

# === 3. 確認 .next/standalone 內容 ===
Write-Host '=== .next/standalone 內容 ==='
Get-ChildItem 'D:\Claude Code Work Space\Stock_Pro\.next\standalone' |
  Select-Object Name, Length |
  Format-Table -AutoSize

Write-Host '=== page bundle hash（應該看到 page-2087c462a34cca38.js） ==='
Get-ChildItem 'D:\Claude Code Work Space\Stock_Pro\.next\standalone\.next\static\chunks\app\' -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'page-*.js' } |
  Select-Object Name, Length |
  Format-Table -AutoSize

# === 4. 啟動新 server（背景，env 從 .env.local 注入） ===
# 策略：先寫一個一次性 batch 檔注入 env + 啟動 node + redirect log，再用 Start-Process 跑 batch
#   這樣避免 PowerShell 5.1 不支援 -RedirectStandardOutput 的問題
Write-Host '=== 啟動新 server（背景） ==='
$logFile = 'C:\Users\user\AppData\Local\Temp\prod-v053.log'
$workDir = 'D:\Claude Code Work Space\Stock_Pro\.next\standalone'
$batchFile = 'C:\Users\user\AppData\Local\Temp\start-v053.bat'

# 讀 .env.local 注入 env（先做這步，不靠 batch）
$envFile = 'D:\Claude Code Work Space\Stock_Pro\.env.local'
$envVars = @{}
if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
      $envVars[$matches[1].Trim()] = $matches[2].Trim()
    }
  }
}
Write-Host "  loaded $($envVars.Count) env vars from .env.local"

# 注入到**目前 PowerShell process** 的 env（這樣 Start-Process 預設會繼承）
foreach ($k in $envVars.Keys) {
  [System.Environment]::SetEnvironmentVariable($k, $envVars[$k], 'Process')
}

# 寫 batch 檔（直接 node + redirect，無需 cmd 嵌套）
$batchContent = "@echo off`r`n"
$batchContent += "cd /d `"$workDir`"`r`n"
$batchContent += "node server.js > `"$logFile`" 2>&1`r`n"
[System.IO.File]::WriteAllText($batchFile, $batchContent, [System.Text.Encoding]::ASCII)
Write-Host "  batch: $batchFile"

# 啟動 batch（Start-Process 會用目前 process 的 env，包含注入的 .env.local 值）
$proc = Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c', $batchFile `
  -WindowStyle Hidden `
  -PassThru
Write-Host "  cmd launcher PID=$($proc.Id)"

# === 5. 等 server ready ===
Write-Host '=== 等待 server ready ==='
$ready = $false
for ($i = 1; $i -le 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $resp = Invoke-WebRequest -Uri 'http://localhost:3000/' -UseBasicParsing -TimeoutSec 2
    if ($resp.StatusCode -eq 200) {
      Write-Host "  ready after ${i}s (HTTP 200)"
      $ready = $true
      break
    }
  } catch {
    # 還沒起來
  }
}

if (-not $ready) {
  Write-Host '  ❌ server 沒起來，請看 log:'
  Get-Content $logFile -ErrorAction SilentlyContinue | Select-Object -Last 20
  exit 1
}

# === 6. 驗證 AI 報告 ===
Write-Host '=== 測試 /api/ai-report ==='
$body = @'
{"overview":{"symbol":"2330.TW","name":"台積電","exchange":"TAI","price":580.0,"currency":"TWD"},"financials":{"years":[]},"news":[],"competitors":[]}
'@
try {
  $aiResp = Invoke-WebRequest -Uri 'http://localhost:3000/api/ai-report' `
    -Method POST -ContentType 'application/json' -Body $body `
    -UseBasicParsing -TimeoutSec 130
  Write-Host "  AI 報告 HTTP $($aiResp.StatusCode), length $($aiResp.Content.Length)"
  $aiResp.Content.Substring(0, [Math]::Min(200, $aiResp.Content.Length))
} catch {
  $statusCode = $_.Exception.Response.StatusCode.value__
  Write-Host "  ❌ AI 報告失敗 HTTP $statusCode"
  $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
  $reader.ReadToEnd()
}

Write-Host ''
Write-Host '=== 完成 ==='
Write-Host 'log: ' $logFile
