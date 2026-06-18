#!/bin/bash
# Wholesale Research Tool - Startup Script

echo "Starting Wholesale Research Tool..."
echo ""

# Start backend server in background
echo "Launching backend server on port 5000..."
(cd backend && npm start) &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Start frontend dev server
echo "Launching frontend dev server on port 4173..."
npm run dev

# Clean up on exit
trap "kill $BACKEND_PID" EXIT
