#!/usr/bin/env bash
set -euo pipefail

# Check for required environment variables
REQUIRED_VARS=(
  "AWS_ACCESS_KEY_ID"
  "AWS_SECRET_ACCESS_KEY"
  "CLOUDFLARE_API_TOKEN"
  "CLOUDFLARE_ACCOUNT_ID"
  "DATABASE_URL"
  "WEBHOOK_SECRET"
  "MOCK_CALLBACK_TOKEN"
  "TEST_MERCHANT_KEY"
)

# Optional vars that are highly recommended
OPTIONAL_VARS=(
  "CLOUDFLARE_SUBDOMAIN"
  "AWS_REGION"
)

MISSING=0

echo "Validating CI Secrets..."

for VAR in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!VAR:-}" ]]; then
    echo "❌ Missing required variable: $VAR"
    MISSING=1
  else
    echo "✓ $VAR is set"
  fi
done

for VAR in "${OPTIONAL_VARS[@]}"; do
  if [[ -z "${!VAR:-}" ]]; then
    echo "⚠️ Missing optional variable: $VAR"
  else
    echo "✓ $VAR is set"
  fi
done

if [[ "$MISSING" -eq 1 ]]; then
  echo "Validation failed! Missing required secrets."
  exit 1
fi

echo "Secrets validation passed."
