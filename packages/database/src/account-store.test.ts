import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { AccountStore } from "./account-store";
import { createTestDatabase } from "./testing/test-database";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let store: AccountStore;

beforeAll(async () => {
  database = await createTestDatabase();
  store = new AccountStore(database.pool);
});

beforeEach(async () => {
  await database.reset();
});

afterAll(async () => {
  await database.close();
});

describe("account store", () => {
  test("creates one personal account for a new auth user", async () => {
    const user = await database.seedAuthUser({ name: "Ada Lovelace" });

    const first = await store.ensurePersonalAccount(user);
    const second = await store.ensurePersonalAccount(user);

    expect(second).toEqual(first);
    expect(first).toMatchObject({ name: "Ada Lovelace", role: "owner" });
    const count = await database.pool.query<{ count: number }>(
      "select count(*)::int as count from accounts",
    );
    expect(count.rows[0]?.count).toBe(1);
  });

  test("serializes concurrent account provisioning", async () => {
    const user = await database.seedAuthUser({ name: "Grace Hopper" });

    const accounts = await Promise.all(
      Array.from({ length: 5 }, () => store.ensurePersonalAccount(user)),
    );

    expect(new Set(accounts.map((account) => account.accountId)).size).toBe(1);
  });

  test("returns null for an unknown user", async () => {
    expect(await store.findAccountForUser("missing-user")).toBeNull();
  });
});
