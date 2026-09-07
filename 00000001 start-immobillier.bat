@echo off
echo ========================================
echo   Immobillier - Demarrage des serveurs
echo ========================================
echo.

REM Fermer les processus sur le port 3000 (Frontend)
echo [1/4] Fermeture du port 3000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do (
    echo   Fermeture du processus PID: %%a
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

REM Fermer les processus sur le port 8001 (Backend)
echo [2/4] Fermeture du port 8001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
    echo   Fermeture du processus PID: %%a
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo [3/4] Demarrage du backend (port 8001)...
cd packages\api
start "Immobillier Backend" cmd /k "npm run dev"
cd ..\..
timeout /t 3 /nobreak >nul

echo [4/4] Demarrage du frontend (port 3000)...
cd apps\web
start "Immobillier Frontend" cmd /k "npm run dev"
cd ..\..

echo.
echo ========================================
echo   Serveurs demarres avec succes!
echo ========================================
echo   Backend:  http://localhost:8001
echo   Frontend: http://localhost:3000
echo ========================================
echo.
echo   Google OAuth:
echo   - Inscription: http://localhost:3000/register
echo   - Connexion:   http://localhost:3000/login
echo ========================================
echo.
pause

