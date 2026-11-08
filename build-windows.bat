@echo off
setlocal
chcp 65001 >nul
title Criar instalador NicoValBolaLibre
cd /d "%~dp0"
color 0B
cls
echo ========================================================
echo          CRIAR INSTALADOR DO NICOVALBOLALIBRE
echo ========================================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  color 0C
  echo Para CRIAR o instalador, este computador precisa do Node.js 22 ou mais recente.
  echo Isso e necessario somente para quem monta/publica o aplicativo.
  echo O Val e os usuarios finais NAO precisam instalar Node.js.
  echo Baixe em: https://nodejs.org/
  echo.
  pause
  exit /b 1
)
echo [1/3] Instalando os componentes de desenvolvimento...
call npm install
if errorlevel 1 goto erro
echo.
echo [2/3] Criando o instalador Windows...
call npm run dist:win
if errorlevel 1 goto erro
echo.
echo [3/3] Pronto! Procure a pasta dist.
echo O arquivo termina em -Setup.exe.
echo.
pause
exit /b 0
:erro
color 0C
echo.
echo O build falhou. Confira a mensagem acima e a conexao com a internet.
echo.
pause
exit /b 1
