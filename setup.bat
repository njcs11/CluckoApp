@echo off
echo =====================================================
echo   GamFowl AI - Disease Detector Setup (Windows)
echo =====================================================
echo.

:: Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Install Python 3.9+ from https://python.org
    pause
    exit /b 1
)

:: Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

echo [1/4] Setting up Python backend...
cd backend
python -m venv venv
call venv\Scripts\activate
pip install -r requirements.txt
cd ..

echo.
echo [2/4] Setting up React frontend...
cd frontend
npm install
cd ..

echo.
echo =====================================================
echo   Setup complete!
echo   Run: start.bat
echo =====================================================
pause
