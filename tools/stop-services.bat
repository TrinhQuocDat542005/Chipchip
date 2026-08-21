@echo off
echo ===================================================
echo [AI Video Factory] Stopping all services...
echo ===================================================

echo Stopping Node.js and Python processes listening on ports 3000, 8787, 24678...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8787 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :24678 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul

echo All AI Video Factory services stopped clean.
