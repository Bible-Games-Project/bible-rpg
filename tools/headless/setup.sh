#!/bin/sh
# Headless Chromium for checking the game in the console's container
# (no system Chromium). Installs into /tmp/tools, which a console reset wipes:
# run again after one. Then: bun run build; npx vite preview --port 4173 &
#   LD_LIBRARY_PATH=/tmp/al/lib:/tmp node /tmp/tools/shot.mjs script.js /tmp/out
set -e
mkdir -p /tmp/tools
cp "$(dirname "$0")/shot.mjs" /tmp/tools/
cd /tmp/tools
[ -f package.json ] || npm init -y >/dev/null
[ -d node_modules/@sparticuz/chromium ] || npm i puppeteer-core @sparticuz/chromium pngjs >/dev/null 2>&1
node -e "import('@sparticuz/chromium').then(m=>m.default.executablePath()).then(console.log)"
if [ ! -d /tmp/al/lib ]; then
  node -e "const fs=require('fs');fs.writeFileSync('/tmp/al.tar',require('zlib').brotliDecompressSync(fs.readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')))"
  mkdir -p /tmp/al && tar -xf /tmp/al.tar -C /tmp/al
fi
