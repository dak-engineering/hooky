import { describe, expect, test } from "bun:test";

import { createRetentionHandler } from "./retention-handler";

describe("retention handler", () => {
  test("requires the configured cron bearer secret", async () => {
    const handler = createRetentionHandler({
      cronSecret: "cron-secret",
      retentionDays: 30,
      deleteEventsReceivedBefore: async () => ({ deleted: 0 }),
      now: () => new Date("2026-08-11T00:00:00.000Z"),
    });

    const response = await handler(
      new Request("https://hooky.test/api/cron/retention"),
    );

    expect(response.status).toBe(401);
  });

  test("deletes events older than the configured retention window", async () => {
    let receivedBefore: Date | undefined;
    const handler = createRetentionHandler({
      cronSecret: "cron-secret",
      retentionDays: 30,
      deleteEventsReceivedBefore: async ({ before, limit }) => {
        receivedBefore = before;
        expect(limit).toBe(10_000);
        return { deleted: 42 };
      },
      now: () => new Date("2026-08-11T00:00:00.000Z"),
    });

    const response = await handler(
      new Request("https://hooky.test/api/cron/retention", {
        headers: { authorization: "Bearer cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: 42, retentionDays: 30 });
    expect(receivedBefore).toEqual(new Date("2026-07-12T00:00:00.000Z"));
  });
});
