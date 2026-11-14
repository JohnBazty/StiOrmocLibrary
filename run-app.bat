@echo off
setlocal
cd /d "%~dp0"
title STI Library - UI working copy

rem Uses this folder's existing API settings. No installation or migration is performed.
where node >nul 2>&1
if errorlevel 1 (
    echo Node.js is missing. Install Node.js 22.18 or newer, then try again.
    goto :failed
)
where npm >nul 2>&1
if errorlevel 1 (
    echo npm is missing. Install Node.js with npm, then try again.
    goto :failed
)
if not exist "apps\api\.env" (
    echo Missing apps\api\.env. Add your configured API settings file, then try again.
    goto :failed
)
if not exist "node_modules\.bin\concurrently.cmd" (
    echo Dependencies are missing. Open a terminal in this folder and run npm ci first.
    goto :failed
)

if exist "%LOCALAPPDATA%\STILibraryLocal\start-postgres.ps1" (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%LOCALAPPDATA%\STILibraryLocal\start-postgres.ps1" -EnvFile "%~dp0apps\api\.env"
    if errorlevel 1 goto :failed
)

echo Starting the website and API...
echo Website normally opens at http://127.0.0.1:5174
echo Check the WEB output for the actual address.
echo Press Ctrl+C to stop the app.
call node "%~dp0node_modules\concurrently\dist\bin\index.js" -n WEB,API -c cyan,green "npm run dev -w @sti-library/web -- --port 5174 --host 127.0.0.1" "npm run dev:api"
if errorlevel 1 goto :failed
exit /b 0

:failed
echo.
echo The app could not start. Review the message above.
pause
exit /b 1
