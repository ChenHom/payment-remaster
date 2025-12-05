# Payment Remaster - Minimal Payment Flow

This project implements a minimal payment flow using Cloudflare Workers (TypeScript), PostgreSQL (Hyperdrive/local), and AWS SQS + Lambda bridge.

Quickstart (local):

1. Start services:

```bash
docker-compose up -d
```

2. Install dependencies:

```bash
pnpm install
pnpm -w build
```

3. Run workers locally (examples):

```bash
# in each worker
pnpm --filter order-ingress dev
```

4. Run tests:

```bash
pnpm -w test
```

Notes:
- For cloud deployments, follow `wrangler` and `SAM` for lambda bridge deployment.
