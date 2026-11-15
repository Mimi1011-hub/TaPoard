@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
for /f "delims=" %%L in ('powershell -NoProfile -Command "if ((Get-UICulture).Name -like 'ja*') {'ja'} else {'en'}"') do set "LANGUAGE=%%L"
if not exist "TaPoard.exe" (
  if "%LANGUAGE%"=="ja" (echo TaPoard.exeが見つかりません。ZIPをすべて展開してください。) else (echo TaPoard.exe was not found. Extract the whole ZIP.)
  pause
  exit /b 1
)
start "" "%~dp0TaPoard.exe"
for /L %%I in (1,1,20) do (
  if exist "%~dp0network.json" goto network_ready
  timeout /t 1 /nobreak >nul
)
if "%LANGUAGE%"=="ja" (echo ネットワーク設定を作成できませんでした。TaPoardを終了して、もう一度実行してください。) else (echo Network settings could not be created. Close TaPoard and try again.)
pause
exit /b 1

:network_ready
if "%LANGUAGE%"=="ja" (echo Windowsの確認画面が表示されたら「はい」を押してください。) else (echo Select Yes when Windows asks for approval.)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-helper.ps1"
if errorlevel 1 (
  if "%LANGUAGE%"=="ja" (echo ファイアウォール設定を完了できませんでした。) else (echo Firewall setup could not be completed.)
  pause
  exit /b 1
)
powershell.exe -NoProfile -Command "$n=[IO.File]::ReadAllText((Join-Path (Get-Location) 'network.json'),[Text.Encoding]::UTF8)|ConvertFrom-Json; $label=if((Get-UICulture).Name -like 'ja*'){'phoneで開くURL: '}else{'Open on your phone: '}; Write-Host ''; Write-Host ($label+'http://'+$n.hostName+':18781/') -ForegroundColor Cyan"
echo.
if "%LANGUAGE%"=="ja" (echo セットアップが完了しました。ブラウザのTaPoard設定画面を確認してください。) else (echo Setup is complete. Check TaPoard settings in the browser.)
pause
