@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist "TaPoard.exe" (
  echo TaPoard.exeが見つかりません。ZIPをすべて展開してください。
  pause
  exit /b 1
)
start "" "%~dp0TaPoard.exe"
for /L %%I in (1,1,20) do (
  if exist "%~dp0network.json" goto network_ready
  timeout /t 1 /nobreak >nul
)
echo ネットワーク設定を作成できませんでした。TaPoardを終了して、もう一度実行してください。
pause
exit /b 1

:network_ready
echo Windowsの確認画面が表示されたら「はい」を押してください。
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-helper.ps1"
if errorlevel 1 (
  echo ファイアウォール設定を完了できませんでした。
  pause
  exit /b 1
)
powershell.exe -NoProfile -Command "$n=[IO.File]::ReadAllText((Join-Path (Get-Location) 'network.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json; Write-Host ''; Write-Host ('iPhoneで開くURL: http://'+$n.hostName+':18781/') -ForegroundColor Cyan"
echo.
echo セットアップが完了しました。ブラウザのTaPoard設定画面を確認してください。
pause
