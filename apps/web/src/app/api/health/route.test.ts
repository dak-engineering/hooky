import { describe, expect, test } from "bun:test";

import { createHealthHandler } from "./route";

describe("health endpoint", () => {
  test("reports that the web service is ready", async () => {
    const response = await createHealthHandler({
      checkDatabase: async () => undefined,
    })();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      service: "hooky-web",
      status: "ok",
    });
  });

  test("reports an unavailable dependency without leaking its error", async () => {
    const response = await createHealthHandler({
      checkDatabase: async () => {
        throw new Error("postgresql://secret@database.internal/hooky");
      },
    })();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      service: "hooky-web",
      status: "unavailable",
    });
  });
});
