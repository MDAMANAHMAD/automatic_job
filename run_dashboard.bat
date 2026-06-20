@echo off
title Auto Job Apply Agent Launcher
echo ========================================================
echo        Starting Auto Job Apply Agent Local Services
echo ========================================================
echo.

echo [1/3] Launching Backend Server (Port 5000)...
start "Job Agent Backend" cmd /c "cd backend && npm run dev"

echo [2/3] Launching Frontend Server (Port 5173)...
start "Job Agent Frontend" cmd /c "cd frontend && npm run dev"

echo [3/3] Waiting for servers to initialize...
timeout /t 3 /nobreak >nul

echo Opening dashboard in your browser...
start http://localhost:5173

echo.
echo ========================================================
echo   Services are running. Close the terminal windows to
echo   stop the application.
echo ========================================================
exit
