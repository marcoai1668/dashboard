@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Dashboard - localhost:3000

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install from https://nodejs.org
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies for the first time...
  call npm install
)

node server.js
pause
