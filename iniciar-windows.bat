@echo off
setlocal
chcp 65001 >nul
title NicoValBolaLibre - Abrir
color 0B
cd /d "%~dp0"
cls
echo.
echo  ========================================================
echo                  NICOVALBOLALIBRE
echo  ========================================================
echo.
echo  INICIAR O SITE
echo.
if not exist "server.js" (
  color 0C
  echo  ERRO: nao encontrei o servidor nesta pasta.
  echo  Extraia o ZIP inteiro antes de abrir este arquivo.
  echo.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  color 0C
  echo  FALTA INSTALAR O NODE.JS 18 OU MAIS NOVO.
  echo  Abra: https://nodejs.org/
  echo  Instale a versao LTS e depois clique duas vezes neste arquivo.
  echo.
  pause
  exit /b 1
)
for /f "delims=" %%V in ('node -p "Number(process.versions.node.split('.')[0])" 2^>nul') do set NODE_MAJOR=%%V
if not defined NODE_MAJOR (
  color 0C
  echo  Nao consegui identificar a versao do Node.js.
  pause
  exit /b 1
)
if %NODE_MAJOR% LSS 18 (
  color 0C
  echo  Sua versao do Node.js e antiga. Instale a versao 18 ou mais nova:
  echo  https://nodejs.org/
  pause
  exit /b 1
)
rem Se o apelido local ja existe, mantem a origem antiga e as configuracoes salvas.
rem Em computadores novos, usa localhost sem pedir permissao de administrador.
set "SITE_NAME=127.0.0.1"
findstr /I /C:"nicoval.bolalibre" "%SystemRoot%\System32\drivers\etc\hosts" >nul 2>nul
if not errorlevel 1 set "SITE_NAME=nicoval.bolalibre"
set "PORT=8787"
echo  Tudo certo! O site vai abrir sozinho no navegador.
echo  Deixe esta janela aberta enquanto estiver usando.
echo  Para fechar o NicoValBolaLibre, pressione CTRL + C.
echo.
node server.js
if errorlevel 1 (
  color 0C
  echo.
  echo  O NicoValBolaLibre nao conseguiu iniciar. Veja a mensagem acima.
)
echo.
echo  O servidor foi encerrado.
pause
