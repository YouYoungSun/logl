@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 20 or later is required. Install Node.js and try again.
  pause
  exit /b 1
)
node scripts/serve.mjs --open
pause
