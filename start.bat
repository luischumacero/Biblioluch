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
    echo  El servidor elegira un puerto disponible y abrira la direccion correcta.
    echo.
    echo  [Presiona Ctrl+C para detener]
    echo.
    set BIBLIOLUCH_OPEN_BROWSER=1
    node server.js
    goto :end
)

echo.
echo  ERROR: No se encontro Node.js.
echo.
echo  Node.js es necesario para importar y guardar libros PDF.
echo  Instala Node.js desde: https://nodejs.org
echo.
pause
:end
