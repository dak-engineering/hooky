import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";

import { DeliveryStore, HookUnavailableError } from "./delivery-store";
import { createTestDatabase } from "./testing/test-database";

let database: Awaited<ReturnType<typeof createTestDatabase>>;
let store: DeliveryStore;

beforeAll(async () => {
  database = await createTestDatabase();
  store = new DeliveryStore(database.pool);
});

beforeEach(async () => {
  await database.reset();
});

afterAll(async () => {
  await database.close();
});

describe("delivery store", () => {
  test("records and claims a webhook event for its account", async () => {
    const { accountId, hookId } = await database.seedAccountAndHook();
    const receivedAt = new Date("2026-08-11T20:00:00.000Z");

    const recorded = await store.recordWebhookEvent({
      accountId,
      hookId,
      requestMethod: "POST",
      requestPath: "/checkout",
      query: { attempt: "1" },
      headers: { "content-type": "application/json" },
      body: Buffer.from('{"order":"ord_123"}'),
      receivedAt,
    });
    const claimed = await store.claimDeliveries({
      accountId,
      hookId,
      listenerId: "listener-one",
      limit: 10,
      leaseDurationSeconds: 30,
      now: new Date("2026-08-11T20:00:01.000Z"),
    });

    expect(recorded.eventId).toBe(claimed[0]?.eventId);
    expect(recorded.deliveryId).toBe(claimed[0]?.deliveryId);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]).toMatchObject({
      attemptNumber: 1,
      requestMethod: "POST",
      requestPath: "/checkout",
      query: { attempt: "1" },
      headers: { "content-type": "application/json" },
      receivedAt,
    });
    expect(claimed[0]?.body).toEqual(Buffer.from('{"order":"ord_123"}'));
    expect(claimed[0]?.leaseToken).toMatch(/^[a-f0-9]{64}$/);
  });

  test("never exposes a delivery across account boundaries", async () => {
    const owner = await database.seedAccountAndHook();
    const otherAccount = await database.seedAccountAndHook();

    await store.recordWebhookEvent({
      accountId: owner.accountId,
      hookId: owner.hookId,
      requestMethod: "POST",
      requestPath: "/private",
      query: {},
      headers: {},
      body: Buffer.from("secret"),
      receivedAt: new Date("2026-08-11T20:00:00.000Z"),
    });

    const claimedByOtherAccount = await store.claimDeliveries({
      accountId: otherAccount.accountId,
      hookId: owner.hookId,
      listenerId: "wrong-account",
      limit: 10,
      leaseDurationSeconds: 30,
      now: new Date("2026-08-11T20:00:01.000Z"),
    });

    expect(claimedByOtherAccount).toEqual([]);
  });

  test("allows only one listener to claim an active lease", async () => {
    const { accountId, hookId } = await database.seedAccountAndHook();

    await store.recordWebhookEvent({
      accountId,
      hookId,
      requestMethod: "POST",
      requestPath: "/concurrent",
      query: {},
      headers: {},
      body: Buffer.from("concurrent"),
      receivedAt: new Date("2026-08-11T20:00:00.000Z"),
    });

    const claims = await Promise.all(
      ["listener-one", "listener-two"].map((listenerId) =>
        store.claimDeliveries({
          accountId,
          hookId,
          listenerId,
          limit: 1,
          leaseDurationSeconds: 30,
          now: new Date("2026-08-11T20:00:01.000Z"),
        }),
      ),
    );

    expect(claims.flat()).toHaveLength(1);
  });

  test("redelivers an event after its lease expires", async () => {
    const { accountId, hookId } = await database.seedAccountAndHook();

    await store.recordWebhookEvent({
      accountId,
      hookId,
      requestMethod: "POST",
      requestPath: "/recover",
      query: {},
      headers: {},
      body: Buffer.from("recover"),
      receivedAt: new Date("2026-08-11T20:00:00.000Z"),
    });

    const [firstClaim] = await store.claimDeliveries({
      accountId,
      hookId,
      listenerId: "listener-one",
      limit: 1,
      leaseDurationSeconds: 30,
      now: new Date("2026-08-11T20:00:01.000Z"),
    });
    const beforeExpiry = await store.claimDeliveries({
      accountId,
      hookId,
      listenerId: "listener-two",
      limit: 1,
      leaseDurationSeconds: 30,
      now: new Date("2026-08-11T20:00:30.000Z"),
    });
    const [recoveredClaim] = await store.claimDeliveries({
      accountId,
      hookId,
      listenerId: "listener-two",
      limit: 1,
      leaseDurationSeconds: 30,
      now: new Date("2026-08-11T20:00:32.000Z"),
    });

    expect(beforeExpiry).toEqual([]);
    expect(recoveredClaim?.deliveryId).toBe(firstClaim?.deliveryId);
    expect(recoveredClaim?.attemptNumber).toBe(2);
    expect(recoveredClaim?.leaseToken).not.toBe(firstClaim?.leaseToken);
  });

  test("acknowledges only the current active lease", async () => {
    const { accountId, hookId } = await database.seedAccountAndHook();

    await store.recordWebhookEvent({
      accountId,
      hookId,
      requestMethod: "POST",
      requestPath: "/ack",
      query: {},
      headers: {},
      body: Buffer.from("ack"),
      receivedAt: new Date("2026-08-11T20:00:00.000Z"),
    });
    const [claim] = await store.claimDeliveries({
      accountId,
      hookId,
      listenerId: "listener-one",
      limit: 1,
      leaseDurationSeconds: 30,
      now: new Date("2026-08-11T20:00:01.000Z"),
    });

    const rejectedToken = await store.acknowledgeDelivery({
      accountId,
      deliveryId: claim!.deliveryId,
      leaseToken: "incorrect-token",
      now: new Date("2026-08-11T20:00:02.000Z"),
    });
    const acknowledged = await store.acknowledgeDelivery({
      accountId,
      deliveryId: claim!.deliveryId,
      leaseToken: claim!.leaseToken,
      now: new Date("2026-08-11T20:00:03.000Z"),
    });
    const duplicateAcknowledgement = await store.acknowledgeDelivery({
      accountId,
      deliveryId: claim!.deliveryId,
      leaseToken: claim!.leaseToken,
      now: new Date("2026-08-11T20:00:04.000Z"),
    });
    const redelivery = await store.claimDeliveries({
      accountId,
      hookId,
      listenerId: "listener-two",
      limit: 1,
      leaseDurationSeconds: 30,
      now: new Date("2026-08-12T20:00:00.000Z"),
    });

    expect(rejectedToken).toBe(false);
    expect(acknowledged).toBe(true);
    expect(duplicateAcknowledgement).toBe(false);
    expect(redelivery).toEqual([]);
  });

  test("releases a rejected delivery at its requested retry time", async () => {
    const { accountId, hookId } = await database.seedAccountAndHook();

    await store.recordWebhookEvent({
      accountId,
      hookId,
      requestMethod: "POST",
      requestPath: "/retry",
      query: {},
      headers: {},
      body: Buffer.from("retry"),
      receivedAt: new Date("2026-08-11T20:00:00.000Z"),
    });
    const [claim] = await store.claimDeliveries({
      accountId,
      hookId,
      listenerId: "listener-one",
      limit: 1,
      leaseDurationSeconds: 30,
      now: new Date("2026-08-11T20:00:01.000Z"),
    });
    const retryAt = new Date("2026-08-11T20:01:00.000Z");

    const rejected = await store.rejectDelivery({
      accountId,
      deliveryId: claim!.deliveryId,
      leaseToken: claim!.leaseToken,
      error: "Local destination returned 503",
      retryAt,
      now: new Date("2026-08-11T20:00:02.000Z"),
    });
    const beforeRetry = await store.claimDeliveries({
      accountId,
      hookId,
      listenerId: "listener-two",
      limit: 1,
      leaseDurationSeconds: 30,
      now: new Date("2026-08-11T20:00:59.000Z"),
    });
    const [retryClaim] = await store.claimDeliveries({
      accountId,
      hookId,
      listenerId: "listener-two",
      limit: 1,
      leaseDurationSeconds: 30,
      now: retryAt,
    });

    expect(rejected).toBe(true);
    expect(beforeRetry).toEqual([]);
    expect(retryClaim?.deliveryId).toBe(claim?.deliveryId);
    expect(retryClaim?.attemptNumber).toBe(2);
  });

  test("extends an active lease from the heartbeat time", async () => {
    const { accountId, hookId } = await database.seedAccountAndHook();

    await store.recordWebhookEvent({
      accountId,
      hookId,
      requestMethod: "POST",
      requestPath: "/slow",
      query: {},
      headers: {},
      body: Buffer.from("slow"),
      receivedAt: new Date("2026-08-11T20:00:00.000Z"),
    });
    const [claim] = await store.claimDeliveries({
      accountId,
      hookId,
      listenerId: "listener-one",
      limit: 1,
      leaseDurationSeconds: 30,
      now: new Date("2026-08-11T20:00:01.000Z"),
    });

    const leasedUntil = await store.extendDeliveryLease({
      accountId,
      deliveryId: claim!.deliveryId,
      leaseToken: claim!.leaseToken,
      leaseDurationSeconds: 30,
      now: new Date("2026-08-11T20:00:20.000Z"),
    });

    expect(leasedUntil).toEqual(new Date("2026-08-11T20:00:50.000Z"));
  });

  test("refuses to record against another account's hook", async () => {
    const owner = await database.seedAccountAndHook();
    const otherAccount = await database.seedAccountAndHook();

    const recording = store.recordWebhookEvent({
      accountId: otherAccount.accountId,
      hookId: owner.hookId,
      requestMethod: "POST",
      requestPath: "/forbidden",
      query: {},
      headers: {},
      body: Buffer.from("forbidden"),
      receivedAt: new Date("2026-08-11T20:00:00.000Z"),
    });

    await expect(recording).rejects.toBeInstanceOf(HookUnavailableError);
  });

  test("keeps captured webhook events immutable", async () => {
    const { accountId, hookId } = await database.seedAccountAndHook();
    const recorded = await store.recordWebhookEvent({
      accountId,
      hookId,
      requestMethod: "POST",
      requestPath: "/original",
      query: {},
      headers: {},
      body: Buffer.from("immutable"),
      receivedAt: new Date("2026-08-11T20:00:00.000Z"),
    });

    const mutation = database.pool.query(
      "update webhook_events set request_path = $1 where id = $2",
      ["/changed", recorded.eventId],
    );

    await expect(mutation).rejects.toThrow("webhook events are immutable");
  });

  test("refuses to record against a disabled hook", async () => {
    const { accountId, hookId } = await database.seedAccountAndHook();
    await database.pool.query(
      "update hooks set state = 'disabled' where id = $1",
      [hookId],
    );

    const recording = store.recordWebhookEvent({
      accountId,
      hookId,
      requestMethod: "POST",
      requestPath: "/disabled",
      query: {},
      headers: {},
      body: Buffer.from("disabled"),
      receivedAt: new Date("2026-08-11T20:00:00.000Z"),
    });

    await expect(recording).rejects.toBeInstanceOf(HookUnavailableError);
  });
});
