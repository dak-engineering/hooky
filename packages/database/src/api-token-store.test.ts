import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { ApiTokenStore } from "./api-token-store";
import { createTestDatabase } from "./testing/test-database";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let store: ApiTokenStore;

beforeAll(async () => {
  database = await createTestDatabase();
  store = new ApiTokenStore(database.pool);
});

beforeEach(async () => {
  await database.reset();
});

afterAll(async () => {
  await database.close();
});

describe("API token store", () => {
  test("creates a one-time token and authenticates it", async () => {
    const { accountId } = await database.seedAccount();
    const created = await store.createToken({
      accountId,
      name: "MacBook listener",
    });

    expect(created.token).toMatch(/^hky_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/);
    expect(await store.authenticateToken(created.token)).toMatchObject({
      accountId,
      tokenId: created.tokenId,
    });
    const stored = await database.pool.query<{
      token_hash: string;
    }>("select token_hash from api_tokens where id = $1", [created.tokenId]);
    expect(stored.rows[0]?.token_hash).not.toContain(created.token);
  });

  test("revocation is immediate and tenant scoped", async () => {
    const owner = await database.seedAccount();
    const other = await database.seedAccount();
    const created = await store.createToken({
      accountId: owner.accountId,
      name: "Local listener",
    });

    expect(
      await store.revokeToken({
        accountId: other.accountId,
        tokenId: created.tokenId,
      }),
    ).toBe(false);
    expect(
      await store.revokeToken({
        accountId: owner.accountId,
        tokenId: created.tokenId,
      }),
    ).toBe(true);
    expect(await store.authenticateToken(created.token)).toBeNull();
  });

  test("lists metadata without hashes or plaintext secrets", async () => {
    const { accountId } = await database.seedAccount();
    const created = await store.createToken({
      accountId,
      name: "CI listener",
    });

    const listed = await store.listTokens({ accountId });

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      tokenId: created.tokenId,
      name: "CI listener",
      prefix: created.token.slice(0, 12),
      revokedAt: null,
    });
    expect(JSON.stringify(listed)).not.toContain(created.token);
  });
});
