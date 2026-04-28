#!/bin/sh
# One-time setup: parse Constitution, seed DB, build and start container
set -e

echo "==> Fetching and parsing Constitution from kremlin.ru..."
docker run --rm \
  -v "$(pwd)":/workspace \
  -w /workspace \
  node:20-alpine \
  sh -c "node parse.js" || {
    echo ""
    echo "Auto-fetch failed. Download manually:"
    echo "  curl -A 'Mozilla/5.0' 'http://www.kremlin.ru/acts/constitution/item' -L -o kremlin.html"
    echo "  node parse.js --file kremlin.html"
    exit 1
  }

echo "==> Seeding SQLite database..."
docker run --rm \
  -v "$(pwd)":/workspace \
  -w /workspace \
  node:20-alpine \
  sh -c "apk add --no-cache python3 make g++ >/dev/null 2>&1 && npm install >/dev/null 2>&1 && node seed.js"

echo "==> Building Docker image..."
docker compose build

echo "==> Starting container..."
docker compose up -d

echo ""
echo "Done! Backend: http://localhost:3002"
echo "Mini App frontend served at: http://localhost:3002/"
