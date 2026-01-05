@echo off
echo ========================================
echo   Regenerating Prisma Client and Restarting
echo ========================================
echo.

REM Navigate to API directory
cd packages\api

echo [1/3] Regenerating Prisma Client...
call npx prisma generate

echo.
echo [2/3] Killing existing processes...
cd ..\..

REM Kill processes on port 8001
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
    echo   Killing process on port 8001 (PID: %%a)
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 2 /nobreak >nul

echo [3/3] Starting backend...
cd packages\api
start "Immobillier Backend" cmd /k "npm run dev"
cd ..\..

echo.
echo ========================================
echo   Backend restarted successfully!
echo ========================================
echo   Backend: http://localhost:8001
echo ========================================
echo.
pause
