#!/usr/bin/env bash
set -euo pipefail

# Minimal deploy script for Cloudflare Workers (requires wrangler configured)
for pkg in workers/*; do
  echo "Deploying $pkg..."
  (cd "$pkg" && wrangler publish)
done

echo "Workers deployed"
