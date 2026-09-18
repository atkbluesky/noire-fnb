@echo off
REM ============================================================
REM  NOIRE - TU DONG CAP NHAT
REM  De cua so nay mo. Cu tha file Excel vao L0_input\ la he thong
REM  tu cap nhat dashboard sau khi file chep xong (soat moi 30 giay).
REM  Dong cua so de dung.
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"
where python >nul 2>nul && (set PYEXE=python) || (set PYEXE=py)
%PYEXE% update.py --watch
pause
