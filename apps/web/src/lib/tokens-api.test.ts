import { describe, expect, test } from "bun:test";

import {
  createTokenCollectionHandlers,
  createTokenRevocationHandler,
} from "./tokens-api";

describe("tokens API", () => {
  test("returns a newly created secret exactly once", async () => {
    const handlers = createTokenCollectionHandlers({
      authenticate: async () => ({ accountId: "account-one" }),
      createToken: async (input) => ({
        tokenId: "token-one",
        name: input.name,
        prefix: "hky_prefix",
        token: "hky_plaintext_secret",
        createdAt: new Date("2026-08-11T20:00:00.000Z"),
      }),
      listTokens: async () => [
        {
          tokenId: "token-one",
          name: "MacBook",
          prefix: "hky_prefix",
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date("2026-08-11T20:00:00.000Z"),
        },
      ],
    });
    const created = await handlers.POST(
      new Request("https://hooky.test/api/v1/tokens", {
        method: "POST",
        body: JSON.stringify({ name: "MacBook", accountId: "attacker" }),
      }),
    );
    const listed = await handlers.GET(
      new Request("https://hooky.test/api/v1/tokens"),
    );

    expect((await created.json()).token).toBe("hky_plaintext_secret");
    expect(JSON.stringify(await listed.json())).not.toContain(
      "hky_plaintext_secret",
    );
  });

  test("revokes within the authenticated account", async () => {
    let input: { accountId: string; tokenId: string } | undefined;
    const revoke = createTokenRevocationHandler({
      authenticate: async () => ({ accountId: "account-one" }),
      revokeToken: async (value) => {
        input = value;
        return true;
      },
    });
    const response = await revoke(
      new Request("https://hooky.test/api/v1/tokens/token-one", {
        method: "DELETE",
      }),
      "token-one",
    );

    expect(response.status).toBe(200);
    expect(input).toEqual({ accountId: "account-one", tokenId: "token-one" });
  });
});
