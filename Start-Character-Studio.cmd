@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Please install Node.js 24 or newer from https://nodejs.org/ then reopen this file.
 pause
 exit /b 1
)
if not exist node_modules\next\dist\bin\next (
 call npm install
 if errorlevel 1 (
  echo Dependency installation failed. See the error above.
  pause
  exit /b 1
 )
)
call npm run dev
pause
