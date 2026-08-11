# Hooky

Hooky is a durable webhook inbox and local development relay. It stores incoming webhooks in the cloud and delivers them when a developer's local environment is ready—without exposing localhost to the public internet.

The product plan and implementation decisions live in [PRD issue #1](https://github.com/dak-engineering/hooky/issues/1).

## Repository

This Bun workspace currently contains the Next.js web application in `apps/web`. Additional database, relay-core, shared, CLI, and test-support packages will be introduced with the vertical slices that need them.

## Development

Install dependencies and start the web application:

```bash
bun install
bun run dev
```

The application runs at [http://localhost:3000](http://localhost:3000), with its health endpoint at [http://localhost:3000/api/health](http://localhost:3000/api/health).

## Validation

```bash
bun run lint
bun run prettier:check
bun run typecheck
bun test
bun run test:e2e
bun run build
```
