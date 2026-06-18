@echo off
setlocal

cd /d "%~dp0"

where bun >nul 2>nul
if errorlevel 1 (
  echo Bun is not installed or is not available in PATH.
  echo Install Bun first: https://bun.sh
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo node_modules was not found. Installing dependencies with bun install...
  bun install
  if errorlevel 1 (
    echo.
    echo Dependency installation failed.
    pause
    exit /b %errorlevel%
  )
)

echo Starting 1Code desktop app...
echo.
bun run dev
set EXIT_CODE=%errorlevel%

echo.
echo 1Code exited with code %EXIT_CODE%.
pause
exit /b %EXIT_CODE%
