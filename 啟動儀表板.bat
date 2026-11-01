@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Dashboard - localhost:3000

echo.
echo  ============================================
echo    Dashboard 啟動中...
echo  ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo  [錯誤] 找不到 Node.js
  echo.
  echo  請先安裝 Node.js: https://nodejs.org
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo  首次執行，正在安裝相依套件...
  call npm install
  echo.
)

echo  啟動本機服務（瀏覽器會自動開啟）
echo  要停止服務，直接關閉此視窗或按 Ctrl+C
echo.

node server.js

echo.
echo  服務已停止。
pause
