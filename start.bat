@echo off
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Oshibka: Node.js ne nayden. Ustanovite Node.js 20+ s https://nodejs.org/
  pause
  exit /b 1
)

node scripts\local-start.mjs
pause
