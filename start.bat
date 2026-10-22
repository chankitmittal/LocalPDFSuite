@echo off
echo ==========================================================
echo Starting LocalPDF Suite (100%% Offline Desktop PDF & Image Tools)
echo ==========================================================
echo.
echo Architecture: Stdio IPC Native Engine (Zero Ports, Zero Firewall Prompts)
echo.

:: Start Python sidecar fallback engine for web dev mode if needed
start "LocalPDF Sidecar Engine" /min .\venv\Scripts\python.exe sidecar-engine\main.py --port 8765

:: Wait 1 second
timeout /t 1 /nobreak > nul

:: Launch Vite frontend development server
echo Launching frontend...
npm run dev
