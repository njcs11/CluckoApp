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

:: Start backend in new window using venv python directly (avoids Microsoft Store alias)
if exist "%~dp0backend\venv\Scripts\python.exe" (
    start "GamFowl Backend" cmd /k "cd /d "%~dp0backend" && venv\Scripts\python.exe app.py"
) else (
    start "GamFowl Backend" cmd /k "cd /d "%~dp0backend" && (py -3.12 app.py 2>nul || python app.py)"
)

:: Wait a moment
timeout /t 3 /nobreak >nul

:: Start frontend in new window
start "GamFowl Frontend" cmd /k "cd /d "%~dp0frontend" && npm start"

echo Both servers launching...
echo Open http://localhost:3000 in your browser.
pause
