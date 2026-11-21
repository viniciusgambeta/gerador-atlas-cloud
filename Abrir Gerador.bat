@echo off
title Gerador
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e abra este arquivo de novo.
  echo.
  start "" https://nodejs.org/pt
  pause
  exit /b 1
)

rem "Abrir Gerador.bat janela" deixa esta janela aberta mostrando as mensagens (para investigar um problema).
if /i "%~1"=="janela" (
  node server.js
  if errorlevel 1 pause
  exit /b
)

rem Uso normal: o Gerador fica rodando em segundo plano, sem janela, e esta aqui fecha sozinha.
rem Para encerrar: Configuracoes, botao Encerrar. As mensagens ficam em data\gerador.log.
set GERADOR_BG=1
set "GERADOR_DIR=%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory $env:GERADOR_DIR -WindowStyle Hidden"
if errorlevel 1 (
  rem Sem PowerShell: abre do jeito antigo, com a janela.
  set GERADOR_BG=
  node server.js
  if errorlevel 1 pause
)
