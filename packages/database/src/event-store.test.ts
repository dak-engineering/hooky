import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { DeliveryStore } from "./delivery-store";
import { EventStore } from "./event-store";
import { createTestDatabase } from "./testing/test-database";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let deliveryStore: DeliveryStore;
let eventStore: EventStore;

beforeAll(async () => {
  database = await createTestDatabase();
  deliveryStore = new DeliveryStore(database.pool);
  eventStore = new EventStore(database.pool);
});

beforeEach(async () => {
  await database.reset();
});

afterAll(async () => {
  await database.close();
});

describe("event store", () => {
  test("lists recent event and delivery state for one tenant hook", async () => {
    const owner = await database.seedAccountAndHook();
    const other = await database.seedAccountAndHook();
    const recorded = await deliveryStore.recordWebhookEvent({
      ...owner,
      requestMethod: "POST",
      requestPath: "/checkout",
      query: { attempt: "1" },
      headers: { "content-type": "application/json" },
      body: Buffer.from('{"order":"ord_123"}'),
      receivedAt: new Date("2026-08-11T20:00:00.000Z"),
    });

    expect(
      await eventStore.listRecentEvents({
        accountId: owner.accountId,
        hookId: owner.hookId,
        limit: 50,
      }),
    ).toEqual([
      {
        eventId: recorded.eventId,
        deliveryId: recorded.deliveryId,
        requestMethod: "POST",
        requestPath: "/checkout",
        status: "pending",
        attemptCount: 0,
        receivedAt: new Date("2026-08-11T20:00:00.000Z"),
      },
    ]);
    expect(
      await eventStore.listRecentEvents({
        accountId: other.accountId,
        hookId: owner.hookId,
        limit: 50,
      }),
    ).toEqual([]);
  });

  test("returns captured details and delivery history only to its tenant", async () => {
    const owner = await database.seedAccountAndHook();
    const other = await database.seedAccountAndHook();
    const recorded = await deliveryStore.recordWebhookEvent({
      ...owner,
      requestMethod: "POST",
      requestPath: "/invoice.paid",
      query: { source: "stripe" },
      headers: { "content-type": "application/json" },
      body: Buffer.from('{"invoice":"in_123"}'),
      receivedAt: new Date("2026-08-11T20:00:00.000Z"),
    });
    const [claim] = await deliveryStore.claimDeliveries({
      ...owner,
      listenerId: "cli-a8f2",
      limit: 1,
      leaseDurationSeconds: 30,
      now: new Date("2026-08-11T20:00:01.000Z"),
    });
    await deliveryStore.acknowledgeDelivery({
      accountId: owner.accountId,
      deliveryId: claim!.deliveryId,
      leaseToken: claim!.leaseToken,
      now: new Date("2026-08-11T20:00:02.000Z"),
    });

    const detail = await eventStore.getEvent({
      accountId: owner.accountId,
      eventId: recorded.eventId,
    });

    expect(detail).toMatchObject({
      eventId: recorded.eventId,
      hookId: owner.hookId,
      requestMethod: "POST",
      requestPath: "/invoice.paid",
      query: { source: "stripe" },
      headers: { "content-type": "application/json" },
      body: Buffer.from('{"invoice":"in_123"}'),
      status: "delivered",
      attempts: [
        {
          attemptNumber: 1,
          listenerId: "cli-a8f2",
          outcome: "delivered",
          startedAt: new Date("2026-08-11T20:00:01.000Z"),
          finishedAt: new Date("2026-08-11T20:00:02.000Z"),
        },
      ],
    });
    expect(
      await eventStore.getEvent({
        accountId: other.accountId,
        eventId: recorded.eventId,
      }),
    ).toBeNull();
  });
});
