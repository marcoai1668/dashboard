@echo off
chcp 65001 >nul
title Dashboard - 取消開機自動啟動

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

if exist "%STARTUP%\Dashboard.vbs" (
  del "%STARTUP%\Dashboard.vbs"
  echo 已取消開機自動啟動。
) else (
  echo 目前沒有設定開機自動啟動。
)

echo.
pause
