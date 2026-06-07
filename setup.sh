#!/bin/bash
echo "====================================================="
echo "  GamFowl AI - Disease Detector Setup (Mac/Linux)"
echo "====================================================="
echo

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] Python3 not found. Install Python 3.9+"
    exit 1
fi

# Check Node
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js not found. Install from https://nodejs.org"
    exit 1
fi

echo "[1/3] Setting up Python backend..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ..

echo ""
echo "[2/3] Setting up React frontend..."
cd frontend
npm install
cd ..

echo ""
echo "====================================================="
echo "  Setup complete! Run: ./start.sh"
echo "====================================================="
