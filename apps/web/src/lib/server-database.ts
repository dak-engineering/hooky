import {
  AccountStore,
  ApiTokenStore,
  createDatabasePool,
  createDrizzleDatabase,
  DeliveryStore,
  HookStore,
} from "@hooky/database";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/hooky";

const globalDatabase = globalThis as typeof globalThis & {
  hookyPool?: ReturnType<typeof createDatabasePool>;
};

export const databasePool =
  globalDatabase.hookyPool ??
  createDatabasePool({ connectionString, maxConnections: 3 });

if (process.env.NODE_ENV !== "production") {
  globalDatabase.hookyPool = databasePool;
}

export const database = createDrizzleDatabase(databasePool);
export const accountStore = new AccountStore(databasePool);
export const apiTokenStore = new ApiTokenStore(databasePool);
export const hookStore = new HookStore(databasePool);
export const deliveryStore = new DeliveryStore(databasePool);
