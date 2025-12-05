#!/usr/bin/env bash
set -euo pipefail

# Start services
if [ "$1" != "--no-docker" ]; then
  docker-compose up -d
fi

# Wait for Postgres
echo "Waiting for Postgres..."
for i in {1..30}; do
  if pg_isready -h localhost -p 5432 -U postgres >/dev/null 2>&1; then
    echo "Postgres ready"
    break
  fi
  sleep 1
done

# Run tests
pnpm -w test

echo "E2E tests executed"
