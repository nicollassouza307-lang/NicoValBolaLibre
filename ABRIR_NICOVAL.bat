@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
if exist "%~dp0NicoValBolaLibre.exe" (
  start "" "%~dp0NicoValBolaLibre.exe"
  exit /b 0
)
if exist "%~dp0dist\win-unpacked\NicoValBolaLibre.exe" (
  start "" "%~dp0dist\win-unpacked\NicoValBolaLibre.exe"
  exit /b 0
)
echo.
echo O aplicativo desktop ainda nao foi compilado/instalado.
echo Se voce recebeu o instalador, execute NicoValBolaLibre-0.17.0-Setup.exe.
echo Para criar o instalador a partir do codigo, execute build-windows.bat.
echo.
pause
