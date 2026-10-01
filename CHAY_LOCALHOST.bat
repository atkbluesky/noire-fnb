@echo off
chcp 65001 >nul
cd /d "%~dp0"
title NOIRE ANALYTICS HUB - Localhost :3001
echo ==================================================
echo   NOIRE ANALYTICS HUB - KHOI DONG LOCALHOST
echo ==================================================
echo.
npm run dev
if errorlevel 1 (
    echo.
    echo Neu lenh tren bi loi, thu chay file CHAY_LOCALHOST.ps1 bang PowerShell.
    pause
)
