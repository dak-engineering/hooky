import { Pool } from "pg";

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
