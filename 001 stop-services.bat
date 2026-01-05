@echo off
setlocal enabledelayedexpansion

:: OphtaClinic Pro - Quick Stop
:: Arrêt rapide de l'application OphtaClinic Pro

title OphtaClinic Pro - Quick Stop

:: Configuration des couleurs
color 0C

echo.
echo ========================================
echo    OphtaClinic Pro - Quick Stop
echo ========================================
echo.

echo [INFO] Arrêt de tous les services OphtaClinic Pro...

:: Arrêter les processus Node.js
echo [INFO] Arrêt des processus Node.js...
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im npm.exe >nul 2>&1

:: Fermer les fenêtres spécifiques
echo [INFO] Fermeture des fenêtres de l'application...
taskkill /f /fi "WINDOWTITLE eq OphtaClinic Backend*" >nul 2>&1
taskkill /f /fi "WINDOWTITLE eq OphtaClinic Frontend*" >nul 2>&1

:: Vérifier que les ports sont libérés
echo [INFO] Vérification des ports...
timeout /t 2 /nobreak >nul

netstat -an | findstr ":4400" >nul
if errorlevel 1 (
    echo [SUCCÈS] Port 4400 (Backend) libéré
) else (
    echo [ATTENTION] Port 4400 (Backend) encore occupé
)

netstat -an | findstr ":3300" >nul
if errorlevel 1 (
    echo [SUCCÈS] Port 3300 (Frontend) libéré
) else (
    echo [ATTENTION] Port 3300 (Frontend) encore occupé
)

echo.
echo ========================================
echo    APPLICATION ARRÊTÉE AVEC SUCCÈS !
echo ========================================
echo.
echo 💡 Pour redémarrer l'application, utilisez start-ophtaclinic.bat
echo.
pause
