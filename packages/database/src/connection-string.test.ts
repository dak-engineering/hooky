import { describe, expect, test } from "bun:test";

import { normalizePostgresConnectionString } from "./connection-string";

describe("normalizePostgresConnectionString", () => {
  test.each(["prefer", "require", "verify-ca"])(
    "upgrades sslmode=%s to full certificate verification",
    (sslMode) => {
      const result = normalizePostgresConnectionString(
        `postgresql://user:password@db.example.test/hooky?sslmode=${sslMode}`,
      );

      expect(new URL(result).searchParams.get("sslmode")).toBe("verify-full");
    },
  );

  test("preserves an explicitly configured SSL mode and other parameters", () => {
    const result = normalizePostgresConnectionString(
      "postgresql://user:password@db.example.test/hooky?sslmode=verify-full&channel_binding=require",
    );
    const url = new URL(result);

    expect(url.searchParams.get("sslmode")).toBe("verify-full");
    expect(url.searchParams.get("channel_binding")).toBe("require");
  });
});
