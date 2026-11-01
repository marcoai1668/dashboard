@echo off
chcp 65001 >nul
title Dashboard - 設為開機自動啟動

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "DIR=%~dp0"

echo.
echo  這會讓儀表板服務在每次開機時自動於背景啟動，
echo  之後開啟 Chrome 主頁 http://localhost:3000 就會有即時資料。
echo.
echo  安裝位置：%STARTUP%\Dashboard.vbs
echo.
set /p CONFIRM=確定要設定嗎？(Y/N):
if /i not "%CONFIRM%"=="Y" (
  echo 已取消。
  pause
  exit /b 0
)

> "%STARTUP%\Dashboard.vbs" echo Set WshShell = CreateObject("WScript.Shell")
>> "%STARTUP%\Dashboard.vbs" echo WshShell.CurrentDirectory = "%DIR%"
>> "%STARTUP%\Dashboard.vbs" echo WshShell.Run "node server.js", 0, False

echo.
echo  完成！下次開機儀表板會自動在背景啟動。
echo  要取消，執行「取消開機自動啟動.bat」。
echo.
pause
