# Hooky

Hooky is a durable webhook inbox and local development relay. It stores incoming webhooks in the cloud and delivers them when a developer's local environment is ready—without exposing localhost to the public internet.

The product plan and implementation decisions live in [PRD issue #1](https://github.com/dak-engineering/hooky/issues/1).

## Repository

This Bun workspace currently contains:

- `apps/web`: the Next.js web application and API surface.
- `packages/database`: the Neon/PostgreSQL schema, migrations, and durable delivery state machine.

Relay-core, shared, CLI, and test-support packages will be introduced with the vertical slices that need them.

## Development

Install dependencies and start the web application:

```bash
bun install
bun run dev
```

The application runs at [http://localhost:3000](http://localhost:3000), with its health endpoint at [http://localhost:3000/api/health](http://localhost:3000/api/health).

## Database

Application traffic must use Neon's pooled connection string through `DATABASE_URL`. The database package keeps captured webhook events immutable and uses short PostgreSQL statements with `FOR UPDATE SKIP LOCKED` for concurrent delivery claims.

Generate a migration after changing the Drizzle schema:

```bash
bun run db:generate
```

Apply committed migrations to the database in `DATABASE_URL`:

```bash
bun run db:migrate
```

Database integration tests use `TEST_DATABASE_URL` when supplied. Otherwise, they start and remove an ephemeral local PostgreSQL cluster with `initdb` and `pg_ctl`.

## Validation

```bash
bun run lint
bun run prettier:check
bun run typecheck
bun test
bun run test:e2e
bun run build
```
