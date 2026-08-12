import { describe, expect, test } from "bun:test";

import { resolveDeploymentOrigin } from "./deployment-origin";

describe("deployment origin", () => {
  test("prefers the explicitly configured canonical URL", () => {
    expect(
      resolveDeploymentOrigin({
        BETTER_AUTH_URL: "https://hooky.vercel.app",
        VERCEL_URL: "hooky-preview.vercel.app",
      }),
    ).toBe("https://hooky.vercel.app");
  });

  test("uses the current Vercel deployment URL for previews", () => {
    expect(
      resolveDeploymentOrigin({ VERCEL_URL: "hooky-preview.vercel.app" }),
    ).toBe("https://hooky-preview.vercel.app");
  });

  test("falls back to localhost for local development", () => {
    expect(resolveDeploymentOrigin({})).toBe("http://localhost:3000");
  });
});
