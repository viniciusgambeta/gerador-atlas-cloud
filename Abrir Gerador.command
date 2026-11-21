#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js nao encontrado. Instale em https://nodejs.org"
  open https://nodejs.org 2>/dev/null
  read -n 1
  exit 1
fi
node server.js
