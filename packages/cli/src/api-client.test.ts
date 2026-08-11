import { describe, expect, test } from "bun:test";

import { HookyApiClient, HookyApiError } from "./api-client";

describe("Hooky API client", () => {
  test("sends bearer authentication and parses responses", async () => {
    let request: Request | undefined;
    const client = new HookyApiClient({
      apiUrl: "https://hooky.test/",
      token: "hky_secret",
      fetchImplementation: async (input, init) => {
        request = new Request(input, init);
        return Response.json({
          hooks: [{ hookId: "hook-one", name: "stripe", state: "active" }],
        });
      },
    });

    const hooks = await client.listHooks();

    expect(hooks).toEqual([
      { hookId: "hook-one", name: "stripe", state: "active" },
    ]);
    expect(request?.url).toBe("https://hooky.test/api/v1/hooks");
    expect(request?.headers.get("authorization")).toBe("Bearer hky_secret");
  });

  test("raises useful API errors", async () => {
    const client = new HookyApiClient({
      apiUrl: "https://hooky.test",
      token: "bad-token",
      fetchImplementation: async () =>
        Response.json({ error: "Authentication required" }, { status: 401 }),
    });

    await expect(client.listHooks()).rejects.toEqual(
      new HookyApiError("Authentication required", 401),
    );
  });
});
