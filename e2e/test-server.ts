import { spawn } from "node:child_process";

import { createTestDatabase } from "../packages/database/src/testing/test-database";

const database = await createTestDatabase();
const serverCommand = process.env.HOOKY_E2E_PRODUCTION ? "start" : "dev";
const webServer = spawn(
  "bun",
  ["run", "--cwd", "apps/web", serverCommand, "--hostname", "127.0.0.1"],
  {
    env: {
      ...process.env,
      DATABASE_URL: database.connectionString,
      BETTER_AUTH_SECRET: "e2e-secret-that-is-at-least-thirty-two-characters",
      BETTER_AUTH_URL: "http://127.0.0.1:3000",
    },
    stdio: "inherit",
  },
);

function stop() {
  webServer.kill("SIGTERM");
}

process.once("SIGINT", stop);
process.once("SIGTERM", stop);

await new Promise<void>((resolve, reject) => {
  webServer.once("error", reject);
  webServer.once("exit", (code, signal) => {
    if (code && code !== 0 && !signal) {
      reject(new Error(`Next.js exited with code ${code}`));
      return;
    }
    resolve();
  });
});

await database.close();
