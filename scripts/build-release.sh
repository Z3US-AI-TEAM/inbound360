#!/usr/bin/env bash
# Gera o pacote estático de produção para a Hostinger (pasta dist + zip).
# Uso: VITE_SUPABASE_URL=https://xxx.supabase.co VITE_SUPABASE_ANON_KEY=sb_publishable_... scripts/build-release.sh
set -euo pipefail
cd "$(dirname "$0")/.."
: "${VITE_SUPABASE_URL:?defina VITE_SUPABASE_URL}"
: "${VITE_SUPABASE_ANON_KEY:?defina VITE_SUPABASE_ANON_KEY}"
export VITE_APP_NAME="${VITE_APP_NAME:-Inbound 360}"
npm ci --no-audit --no-fund >/dev/null
rm -rf dist
npm run build >/dev/null
cp public/.htaccess dist/.htaccess 2>/dev/null || true
STAMP=$(date +%Y%m%d-%H%M)
OUT="release/inbound360_dist_${STAMP}.zip"
mkdir -p release
(cd dist && zip -qr "../$OUT" .)
echo "release pronto: $OUT ($(du -h "$OUT" | cut -f1)) · supabase: $VITE_SUPABASE_URL"
