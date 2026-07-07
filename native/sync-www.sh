#!/bin/sh
# Copy the Arete web app into the native bundle (native/www), then run cap sync.
# Run from anywhere: ./sync-www.sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="$DIR/.."
WWW="$DIR/www"

rm -rf "$WWW"
mkdir -p "$WWW"

# App shell + scripts + styles
cp "$APP/index.html" "$WWW/"
cp "$APP/style.css" "$WWW/"
cp "$APP"/*.js "$WWW/" 2>/dev/null || true
rm -f "$WWW/service-worker.js"   # native app bundles assets; no SW

# Assets
cp "$APP/manifest.json" "$WWW/" 2>/dev/null || true
cp "$APP"/*.png "$WWW/" 2>/dev/null || true

# Strip cache-busting query params (?v=N) — native loads local files directly
sed -i '' 's/\?v=[0-9]*//g' "$WWW/index.html"

echo "www/ synced from APP"
cd "$DIR" && npx cap sync
