#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "O Gerador precisa do Node.js. Instale a versao LTS em https://nodejs.org e tente de novo."
  open https://nodejs.org 2>/dev/null
  read -n 1
  exit 1
fi
node conectar-agentes.js
echo
read -n 1 -s -r -p "Aperte qualquer tecla para fechar"
