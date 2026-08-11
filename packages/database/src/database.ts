import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export function createDatabasePool({
  connectionString,
  maxConnections = 5,
}: {
  connectionString: string;
  maxConnections?: number;
}) {
  return new Pool({
    connectionString,
    max: maxConnections,
  });
}

export function createDrizzleDatabase(pool: Pool) {
  return drizzle(pool, { schema });
}
