#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/deploy-lambda.sh <StackName> <GatewayRouterUrl> <WebhookNotifierUrl>
STACK_NAME=$1
GATEWAY_URL=$2
WEBHOOK_URL=$3

sam deploy --stack-name $STACK_NAME --parameter-overrides GatewayRouterUrl=$GATEWAY_URL WebhookNotifierUrl=$WEBHOOK_URL --guided
