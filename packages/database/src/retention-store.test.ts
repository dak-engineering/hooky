import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { DeliveryStore } from "./delivery-store";
import { RetentionStore } from "./retention-store";
import { createTestDatabase } from "./testing/test-database";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let deliveryStore: DeliveryStore;
let retentionStore: RetentionStore;

beforeAll(async () => {
  database = await createTestDatabase();
  deliveryStore = new DeliveryStore(database.pool);
  retentionStore = new RetentionStore(database.pool);
});

beforeEach(async () => {
  await database.reset();
});

afterAll(async () => {
  await database.close();
});

describe("retention store", () => {
  test("deletes old events and their delivery history in bounded batches", async () => {
    const hook = await database.seedAccountAndHook();
    const oldEvent = await deliveryStore.recordWebhookEvent({
      ...hook,
      requestMethod: "POST",
      requestPath: "/old",
      query: {},
      headers: {},
      body: Buffer.from("old"),
      receivedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const currentEvent = await deliveryStore.recordWebhookEvent({
      ...hook,
      requestMethod: "POST",
      requestPath: "/current",
      query: {},
      headers: {},
      body: Buffer.from("current"),
      receivedAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    expect(
      await retentionStore.deleteEventsReceivedBefore({
        before: new Date("2026-07-01T00:00:00.000Z"),
        limit: 1,
      }),
    ).toEqual({ deleted: 1 });

    const remaining = await database.pool.query<{ id: string }>(
      "select id from webhook_events order by received_at",
    );
    expect(remaining.rows).toEqual([{ id: currentEvent.eventId }]);
    expect(
      await database.pool.query(
        "select id from deliveries where event_id = $1",
        [oldEvent.eventId],
      ),
    ).toMatchObject({ rowCount: 0 });
  });

  test("clamps cleanup work to a safe maximum", async () => {
    const hook = await database.seedAccountAndHook();
    await deliveryStore.recordWebhookEvent({
      ...hook,
      requestMethod: "POST",
      requestPath: "/old",
      query: {},
      headers: {},
      body: Buffer.from("old"),
      receivedAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    expect(
      await retentionStore.deleteEventsReceivedBefore({
        before: new Date("2026-07-01T00:00:00.000Z"),
        limit: 0,
      }),
    ).toEqual({ deleted: 1 });
  });
});
