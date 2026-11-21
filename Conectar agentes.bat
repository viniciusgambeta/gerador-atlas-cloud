@echo off
title Conectar o Gerador aos agentes de IA
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   O Gerador precisa do Node.js. Instale a versao LTS em https://nodejs.org e tente de novo.
  echo.
  pause
  exit /b 1
)
chcp 65001 >nul
node conectar-agentes.js
echo.
pause
