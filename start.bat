@echo off
echo ==========================================================
echo Starting LocalPDF Suite (100%% Offline PDF & Image Tools)
echo ==========================================================
echo.

:: Start Python FastAPI sidecar in background
start "LocalPDF Sidecar Engine" .\venv\Scripts\python.exe sidecar-engine\main.py --port 8765

:: Wait 2 seconds for sidecar to initialize
timeout /t 2 /nobreak > nul

:: Launch frontend
echo Launching frontend...
npm run dev
