@echo off
chcp 65001 >nul
title BiblioLex - Biblioteca Virtual Bolivia
color 0A
echo.
echo  ====================================================
echo    BIBLIOLEX - BIBLIOTECA VIRTUAL DE ESTUDIO
echo    Fiscalia General del Estado Plurinacional
echo  ====================================================
echo.

:: Intentar con Node.js (preferido)
node --version >nul 2>&1
if %errorlevel% == 0 (
    echo  Usando Node.js para el servidor local...
    echo  Servidor activo en: http://localhost:8080
    echo.
    echo  [Presiona Ctrl+C para detener]
    echo.
    start "" "http://localhost:8080"
    node server.js
    goto :end
)

:: Intentar con Python 3
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo  Usando Python para el servidor local...
    echo  Servidor activo en: http://localhost:8080
    echo.
    start "" "http://localhost:8080"
    python -m http.server 8080
    goto :end
)

echo.
echo  ERROR: No se encontro Node.js ni Python.
echo.
echo  Opciones:
echo   1) Instala Node.js desde: https://nodejs.org
echo   2) Instala Python desde:  https://www.python.org
echo.
pause
:end
