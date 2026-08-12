import { describe, expect, test } from "bun:test";

import { hasTrustedOrigin } from "./authenticated-account";

describe("session origin protection", () => {
  test("allows same-origin browser mutations with or without an Origin header", () => {
    expect(
      hasTrustedOrigin(
        new Request("https://hooky.test/api/v1/hooks", {
          method: "POST",
          headers: { origin: "https://hooky.test" },
        }),
      ),
    ).toBe(true);
    expect(
      hasTrustedOrigin(
        new Request("https://hooky.test/api/v1/hooks", {
          method: "POST",
          headers: { "sec-fetch-site": "same-origin" },
        }),
      ),
    ).toBe(true);
  });

  test("rejects cross-origin and non-browser cookie mutations", () => {
    expect(
      hasTrustedOrigin(
        new Request("https://hooky.test/api/v1/hooks", {
          method: "POST",
          headers: { origin: "https://attacker.test" },
        }),
      ),
    ).toBe(false);
    expect(
      hasTrustedOrigin(
        new Request("https://hooky.test/api/v1/hooks", { method: "POST" }),
      ),
    ).toBe(false);
  });
});
