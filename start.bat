@echo off
echo =====================================================
echo   GamFowl AI - Starting Servers
echo =====================================================
echo.
echo Starting Flask backend on http://localhost:5000
echo Starting React frontend on http://localhost:3000
echo.
echo Press Ctrl+C in each window to stop.
echo.

:: Start backend in new window
start "GamFowl Backend" cmd /k "cd backend && venv\Scripts\activate && python app.py"

:: Wait a moment
timeout /t 3 /nobreak >nul

:: Start frontend in new window
start "GamFowl Frontend" cmd /k "cd frontend && npm start"

echo Both servers launching...
echo Open http://localhost:3000 in your browser.
pause
