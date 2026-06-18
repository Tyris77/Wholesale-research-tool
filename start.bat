@echo off
REM Wholesale Research Tool - Startup Script

echo Starting Wholesale Research Tool...
echo.

REM Start backend server
echo Launching backend server on port 5000...
start cmd /k "cd backend && npm start"

REM Wait a moment for backend to start
timeout /t 3 /nobreak

REM Start frontend dev server
echo Launching frontend dev server on port 4173...
start cmd /k "npm run dev"

echo.
echo ============================================
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:4173
echo ============================================
echo.
pause
