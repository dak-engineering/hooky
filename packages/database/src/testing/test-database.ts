import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function reservePort() {
  const server = createServer();

  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to reserve a PostgreSQL test port");
  }

  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });

  return address.port;
}

async function waitForPostgres(pool: Pool) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      await pool.query("select 1");
      return;
    } catch (error) {
      lastError = error;
      await Bun.sleep(50);
    }
  }

  throw new Error("Ephemeral PostgreSQL did not become ready", {
    cause: lastError,
  });
}

async function startEphemeralPostgres() {
  const dataDirectory = await mkdtemp(join(tmpdir(), "hooky-postgres-"));
  const port = await reservePort();

  execFileSync(
    "initdb",
    [
      "-D",
      dataDirectory,
      "-A",
      "trust",
      "-U",
      "postgres",
      "--no-locale",
      "-E",
      "UTF8",
    ],
    { stdio: "ignore" },
  );

  const process = spawn(
    "postgres",
    ["-D", dataDirectory, "-p", String(port), "-k", dataDirectory],
    { stdio: "ignore" },
  );
  const connectionString = `postgresql://postgres@127.0.0.1:${port}/postgres`;
  const pool = new Pool({ connectionString });

  try {
    await waitForPostgres(pool);
  } catch (error) {
    process.kill("SIGTERM");
    await rm(dataDirectory, { recursive: true, force: true });
    throw error;
  }

  return {
    connectionString,
    async stop() {
      await pool.end();
      if (process.exitCode === null && process.signalCode === null) {
        execFileSync("pg_ctl", ["-D", dataDirectory, "stop", "-m", "fast"], {
          stdio: "ignore",
        });
      }
      await rm(dataDirectory, { recursive: true, force: true });
    },
  };
}

export async function createTestDatabase() {
  const configuredConnectionString = process.env.TEST_DATABASE_URL;
  const ephemeral = configuredConnectionString
    ? undefined
    : await startEphemeralPostgres();
  const pool = new Pool({
    connectionString:
      configuredConnectionString ?? ephemeral?.connectionString ?? "",
  });

  await migrate(drizzle(pool), {
    migrationsFolder: resolve(import.meta.dir, "../../migrations"),
  });

  async function seedAccount() {
    const accountId = crypto.randomUUID();
    await pool.query(`insert into accounts (id, name) values ($1, $2)`, [
      accountId,
      "Test account",
    ]);
    return { accountId };
  }

  return {
    connectionString:
      configuredConnectionString ?? ephemeral?.connectionString ?? "",
    pool,
    async reset() {
      await pool.query(
        "truncate table auth_users, accounts restart identity cascade",
      );
    },
    async seedAccount() {
      return seedAccount();
    },
    async seedAuthUser({ name = "Test user" }: { name?: string } = {}) {
      const userId = crypto.randomUUID();
      const email = `${userId}@example.test`;
      await pool.query(
        `insert into auth_users (id, name, email) values ($1, $2, $3)`,
        [userId, name, email],
      );
      return { userId, name, email };
    },
    async seedAccountAndHook() {
      const { accountId } = await seedAccount();
      const hookId = crypto.randomUUID();
      await pool.query(
        `insert into hooks (id, account_id, name) values ($1, $2, $3)`,
        [hookId, accountId, "stripe-dev"],
      );

      return { accountId, hookId };
    },
    async close() {
      await pool.end();
      await ephemeral?.stop();
    },
  };
}
