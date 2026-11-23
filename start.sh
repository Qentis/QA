#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Ошибка: Node.js не найден. Установите Node.js 20+ с https://nodejs.org/"
  exit 1
fi

exec node scripts/local-start.mjs
