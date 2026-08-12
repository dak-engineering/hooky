import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { HookStore } from "./hook-store";
import { createTestDatabase } from "./testing/test-database";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let store: HookStore;

beforeAll(async () => {
  database = await createTestDatabase();
  store = new HookStore(database.pool);
});

beforeEach(async () => {
  await database.reset();
});

afterAll(async () => {
  await database.close();
});

describe("hook store", () => {
  test("creates a hook with a one-time ingress token and resolves it", async () => {
    const { accountId } = await database.seedAccount();

    const created = await store.createHook({
      accountId,
      name: "stripe-dev",
    });
    const resolved = await store.resolveIngressToken(created.ingressToken);

    expect(created.hookId).toBeString();
    expect(created.ingressToken).toMatch(/^hk_[a-f0-9]{32}_[A-Za-z0-9_-]{43}$/);
    expect(resolved).toEqual({ accountId, hookId: created.hookId });
  });

  test("never persists the plaintext ingress secret", async () => {
    const { accountId } = await database.seedAccount();
    const created = await store.createHook({
      accountId,
      name: "github-dev",
    });
    const plaintextSecret = created.ingressToken.split("_").at(-1);
    const result = await database.pool.query<{
      ingress_secret_hash: string;
    }>("select ingress_secret_hash from hook_secrets where hook_id = $1", [
      created.hookId,
    ]);

    expect(result.rows[0]?.ingress_secret_hash).not.toContain(
      plaintextSecret ?? "",
    );
    expect(result.rows[0]?.ingress_secret_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  test("rotates a secret and immediately invalidates the previous token", async () => {
    const { accountId } = await database.seedAccount();
    const created = await store.createHook({
      accountId,
      name: "linear-dev",
    });

    const rotated = await store.rotateIngressSecret({
      accountId,
      hookId: created.hookId,
    });

    expect(rotated.ingressToken).not.toBe(created.ingressToken);
    expect(await store.resolveIngressToken(created.ingressToken)).toBeNull();
    expect(await store.resolveIngressToken(rotated.ingressToken)).toEqual({
      accountId,
      hookId: created.hookId,
    });
  });

  test("keeps listing and rotation tenant scoped", async () => {
    const owner = await database.seedAccount();
    const other = await database.seedAccount();
    const created = await store.createHook({
      accountId: owner.accountId,
      name: "private-dev",
    });

    expect(await store.listHooks({ accountId: other.accountId })).toEqual([]);
    await expect(
      store.rotateIngressSecret({
        accountId: other.accountId,
        hookId: created.hookId,
      }),
    ).rejects.toThrow("Hook not found");
  });
});
