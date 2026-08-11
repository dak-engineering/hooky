import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDrizzleDatabase } from "@hooky/database";
import { createTestDatabase } from "@hooky/database/testing";

import { createHookyAuth } from "./auth";

let testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

afterAll(async () => {
  await testDatabase.close();
});

describe("authentication", () => {
  test("signs up with email/password and persists a session", async () => {
    const testAuth = createHookyAuth({
      database: createDrizzleDatabase(testDatabase.pool),
      baseURL: "http://localhost:3000",
      secret: "test-secret-that-is-more-than-thirty-two-characters",
      secureCookies: false,
    });
    const response = await testAuth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "http://localhost:3000",
        },
        body: JSON.stringify({
          name: "Katherine Johnson",
          email: "katherine@example.test",
          password: "correct-horse-battery-staple",
        }),
      }),
    );
    const cookie = response.headers.get("set-cookie")?.split(";", 1)[0];
    const session = await testAuth.api.getSession({
      headers: new Headers({ cookie: cookie ?? "" }),
    });

    expect(response.status).toBe(200);
    expect(cookie).toContain("hooky.session_token=");
    expect(session?.user).toMatchObject({
      name: "Katherine Johnson",
      email: "katherine@example.test",
    });
  });
});
