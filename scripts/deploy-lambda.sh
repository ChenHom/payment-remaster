#!/usr/bin/env bash
set -euo pipefail

#######################################################################
# T070: Lambda Bridge Deployment Script
#
# Deploys the Lambda Bridge to AWS using SAM CLI.
#
# Usage:
#   ./scripts/deploy-lambda.sh [ENVIRONMENT]
#
# Arguments:
#   ENVIRONMENT: staging | production (default: staging)
#
# Required Environment Variables:
#   GATEWAY_ROUTER_URL: URL of the Gateway Router Worker
#   WEBHOOK_NOTIFIER_URL: URL of the Webhook Notifier Worker
#
# Optional Environment Variables:
#   AWS_REGION: AWS region (default: ap-northeast-1)
#   LOG_LEVEL: DEBUG | INFO | WARN | ERROR (default: INFO)
#   HTTP_TIMEOUT: HTTP timeout in ms (default: 5000)
#######################################################################

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LAMBDA_DIR="$PROJECT_ROOT/lambda-bridge"
ENVIRONMENT="${1:-staging}"
STACK_NAME="payment-lambda-bridge-${ENVIRONMENT}"

# Default values
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
LOG_LEVEL="${LOG_LEVEL:-INFO}"
HTTP_TIMEOUT="${HTTP_TIMEOUT:-5000}"

#######################################################################
# Phase 1: Verify Prerequisites
#######################################################################

log_info "=== Phase 1: Verifying Prerequisites ==="

check_command() {
  if ! command -v "$1" &> /dev/null; then
    log_error "$1 is not installed. Please install it first."
    exit 1
  fi
  log_info "✓ $1 found: $(command -v $1)"
}

# Check required tools
check_command "pnpm"
check_command "aws"
check_command "sam"
check_command "docker"

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
  log_error "AWS credentials not configured. Run 'aws configure' first."
  exit 1
fi
log_info "✓ AWS credentials configured"

# Check required environment variables
if [[ -z "${GATEWAY_ROUTER_URL:-}" ]]; then
  log_error "GATEWAY_ROUTER_URL environment variable is required"
  exit 1
fi
if [[ -z "${WEBHOOK_NOTIFIER_URL:-}" ]]; then
  log_error "WEBHOOK_NOTIFIER_URL environment variable is required"
  exit 1
fi
log_info "✓ Required environment variables set"

#######################################################################
# Phase 2: Build Lambda Functions
#######################################################################

log_info "=== Phase 2: Building Lambda Functions ==="

cd "$LAMBDA_DIR"

# Install dependencies
log_info "Installing dependencies..."
pnpm install

# TypeScript compilation
log_info "Compiling TypeScript..."
pnpm run build

#######################################################################
# Phase 3: SAM Validate, Build, and Deploy
#######################################################################

log_info "=== Phase 3: SAM Validate, Build, and Deploy ==="

# Validate SAM template
log_info "Validating SAM template..."
sam validate --template-file template.yaml --region "$AWS_REGION"

# Build SAM application
log_info "Building SAM application..."
sam build --template-file template.yaml

# Deploy SAM application
log_info "Deploying SAM application to $ENVIRONMENT..."
sam deploy \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    "Environment=$ENVIRONMENT" \
    "GatewayRouterUrl=$GATEWAY_ROUTER_URL" \
    "WebhookNotifierUrl=$WEBHOOK_NOTIFIER_URL" \
    "LogLevel=$LOG_LEVEL" \
    "HttpTimeout=$HTTP_TIMEOUT"

#######################################################################
# Phase 4: Capture and Display Outputs
#######################################################################

log_info "=== Phase 4: Deployment Outputs ==="

# Get stack outputs
OUTPUTS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query 'Stacks[0].Outputs' \
  --output json)

echo ""
log_info "Stack Outputs:"
echo "$OUTPUTS" | jq -r '.[] | "  \(.OutputKey): \(.OutputValue)"'

# Extract Queue URLs for verification
ORDER_QUEUE_URL=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="OrderEventsQueueUrl") | .OutputValue')
STATUS_QUEUE_URL=$(echo "$OUTPUTS" | jq -r '.[] | select(.OutputKey=="StatusChangedQueueUrl") | .OutputValue')

# Output for GitHub Actions or other CI tools
if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
  echo "sqs_queue_url=$ORDER_QUEUE_URL" >> "$GITHUB_OUTPUT"
  log_info "✓ Exported sqs_queue_url to GITHUB_OUTPUT"
fi

echo ""
log_info "=== Deployment Summary ==="
echo "  Stack Name: $STACK_NAME"
echo "  Environment: $ENVIRONMENT"
echo "  Region: $AWS_REGION"
echo ""
echo "  Order Events Queue: $ORDER_QUEUE_URL"
echo "  Status Changed Queue: $STATUS_QUEUE_URL"
echo ""

#######################################################################
# Phase 5: Verification (Optional)
#######################################################################

log_info "=== Phase 5: Verification ==="

# Check Lambda function status
for FUNC_NAME in "payment-gateway-router-trigger-${ENVIRONMENT}" "payment-webhook-notifier-trigger-${ENVIRONMENT}"; do
  STATUS=$(aws lambda get-function \
    --function-name "$FUNC_NAME" \
    --region "$AWS_REGION" \
    --query 'Configuration.State' \
    --output text 2>/dev/null || echo "NOT_FOUND")

  if [[ "$STATUS" == "Active" ]]; then
    log_info "✓ Lambda function $FUNC_NAME is Active"
  else
    log_warn "✗ Lambda function $FUNC_NAME status: $STATUS"
  fi
done

# Check SQS queue status
for QUEUE_URL in "$ORDER_QUEUE_URL" "$STATUS_QUEUE_URL"; do
  if aws sqs get-queue-attributes \
    --queue-url "$QUEUE_URL" \
    --attribute-names QueueArn \
    --region "$AWS_REGION" &> /dev/null; then
    log_info "✓ SQS queue accessible: ${QUEUE_URL##*/}"
  else
    log_warn "✗ Cannot access SQS queue: ${QUEUE_URL##*/}"
  fi
done

echo ""
log_info "=== Deployment Complete ==="
echo ""
echo "Next steps:"
echo "  1. Update Workers with SQS Queue URLs"
echo "  2. Run E2E tests to verify the full flow"
echo "  3. Monitor CloudWatch logs for any issues"
echo ""
