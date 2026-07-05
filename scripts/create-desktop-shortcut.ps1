$ws = New-Object -ComObject WScript.Shell
$lnk = $ws.CreateShortcut("$env:USERPROFILE\Desktop\Stock_Pro.lnk")
$lnk.TargetPath = "D:\Claude Code Work Space\Stock_Pro\start.bat"
$lnk.WorkingDirectory = "D:\Claude Code Work Space\Stock_Pro"
$lnk.IconLocation = "shell32.dll,13"   # 資料夾圖示
$lnk.Description = "啟動 Stock_Pro (Next.js dev server)"
$lnk.WindowStyle = 7                   # 最小化啟動
$lnk.Save()
Write-Host "已建立桌面捷徑：$env:USERPROFILE\Desktop\Stock_Pro.lnk"