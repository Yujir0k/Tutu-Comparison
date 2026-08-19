@echo off
setlocal

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ne naiden. Ustanovite Node.js 20.19 ili novee: https://nodejs.org/
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set "TUTU_NODE_MAJOR=%%V"
if %TUTU_NODE_MAJOR% LSS 20 (
  echo Nuzhen Node.js 20.19 ili novee. Tekushaya versiya:
  node --version
  pause
  exit /b 1
)

echo Ustanavlivaem zavisimosti...
call npm ci
if errorlevel 1 (
  echo Ne udalos ustanovit zavisimosti.
  pause
  exit /b 1
)

echo Zapusk: http://127.0.0.1:5173
call npm run dev
