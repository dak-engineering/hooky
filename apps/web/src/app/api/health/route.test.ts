import { describe, expect, test } from "bun:test";

import { GET } from "./route";

describe("health endpoint", () => {
  test("reports that the web service is ready", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      service: "hooky-web",
      status: "ok",
    });
  });
});
