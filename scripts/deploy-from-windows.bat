@echo off
REM Double-click this file on Windows to deploy Madar CRM to your VPS.
REM It runs the PowerShell script which SSHs into your VPS and executes scripts/deploy.sh

echo.
echo ========================================
echo   Madar CRM - One-Click Deploy
echo ========================================
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0deploy-from-windows.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Deployment finished with errors. See messages above.
    pause
    exit /b %ERRORLEVEL%
)

echo.
pause
