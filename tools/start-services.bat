@echo off
echo ===================================================
echo [AI Video Factory] Checking ports and starting services...
echo ===================================================

echo [1/3] Terminating any process occupying ports 3000, 8787, or 24678...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8787 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :24678 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul

echo [2/3] Checking VieNeu TTS service...
start /b cmd /c ".venv-vieneu\Scripts\python.exe services\vieneu\app.py"

echo [3/3] Starting Web Application (npm run dev)...
npm run dev
