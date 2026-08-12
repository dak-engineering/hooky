import { describe, expect, test } from "bun:test";

import {
  createHooksCollectionHandlers,
  createRotateIngressSecretHandler,
} from "./hooks-api";

describe("hooks API", () => {
  test("requires an authenticated account", async () => {
    const handlers = createHooksCollectionHandlers({
      authenticate: async () => null,
      createHook: async () => {
        throw new Error("must not be called");
      },
      listHooks: async () => [],
    });

    const response = await handlers.GET(
      new Request("https://hooky.test/api/v1/hooks"),
    );

    expect(response.status).toBe(401);
  });

  test("creates an ingress URL without leaking tenant selection", async () => {
    const handlers = createHooksCollectionHandlers({
      authenticate: async () => ({ accountId: "account-one" }),
      createHook: async ({ accountId, name }) => ({
        hookId: `${accountId}:${name}`,
        name,
        state: "active" as const,
        createdAt: new Date("2026-08-11T20:00:00.000Z"),
        ingressToken: "hk_secret",
      }),
      listHooks: async () => [],
    });

    const response = await handlers.POST(
      new Request("https://hooky.test/api/v1/hooks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "stripe-dev", accountId: "attacker" }),
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      hookId: "account-one:stripe-dev",
      name: "stripe-dev",
      state: "active",
      createdAt: "2026-08-11T20:00:00.000Z",
      ingressUrl: "https://hooky.test/e/hk_secret",
    });
  });

  test("rejects invalid JSON input", async () => {
    const handlers = createHooksCollectionHandlers({
      authenticate: async () => ({ accountId: "account-one" }),
      createHook: async () => {
        throw new Error("must not be called");
      },
      listHooks: async () => [],
    });
    const response = await handlers.POST(
      new Request("https://hooky.test/api/v1/hooks", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      }),
    );

    expect(response.status).toBe(400);
  });

  test("rotates only through the authenticated account", async () => {
    let rotatedFor: { accountId: string; hookId: string } | undefined;
    const handler = createRotateIngressSecretHandler({
      authenticate: async () => ({ accountId: "account-one" }),
      rotateIngressSecret: async (input) => {
        rotatedFor = input;
        return { hookId: input.hookId, ingressToken: "hk_rotated" };
      },
    });

    const response = await handler(
      new Request(
        "https://hooky.test/api/v1/hooks/hook-one/rotate-ingress-secret",
        { method: "POST" },
      ),
      "hook-one",
    );

    expect(rotatedFor).toEqual({
      accountId: "account-one",
      hookId: "hook-one",
    });
    expect(await response.json()).toEqual({
      hookId: "hook-one",
      ingressUrl: "https://hooky.test/e/hk_rotated",
    });
  });
});
