@echo off
REM ============================================================
REM  NOIRE - CAP NHAT DASHBOARD
REM  1. Tha file Excel tho vao L0_input\<thu muc nguon>\
REM  2. Nhay dup file nay
REM  3. Doc L0_input\_BAO_CAO_CAP_NHAT.txt
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"

set PYEXE=
where python >nul 2>nul && set PYEXE=python
if not defined PYEXE where py >nul 2>nul && set PYEXE=py
if not defined PYEXE (
    echo Chua cai Python. Tai o python.org, khi cai tich "Add python.exe to PATH".
    pause
    exit /b 1
)

%PYEXE% -c "import openpyxl, pandas" 2>nul || %PYEXE% -m pip install openpyxl pandas lxml

%PYEXE% update.py %*
echo.
echo Bao cao: L0_input\_BAO_CAO_CAP_NHAT.txt
pause
