#!/bin/bash
echo "Starting GamFowl AI..."

# Start backend
cd backend
source venv/bin/activate
python app.py &
BACKEND_PID=$!
cd ..

echo "Backend started (PID: $BACKEND_PID)"
sleep 2

# Start frontend
cd frontend
npm start &
FRONTEND_PID=$!
cd ..

echo "Frontend started (PID: $FRONTEND_PID)"
echo ""
echo "Open http://localhost:3000 in your browser"
echo "Press Ctrl+C to stop both servers"

# Wait and cleanup
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
