import { describe, expect, test } from "bun:test";

import {
  createAcknowledgeHandler,
  createClaimHandler,
  createHeartbeatHandler,
  createRejectHandler,
} from "./listener-api";

const authenticated = async () => ({ accountId: "account-one" });

describe("listener API", () => {
  test("requires authentication before claiming deliveries", async () => {
    const handler = createClaimHandler({
      authenticate: async () => null,
      claimDeliveries: async () => [],
      now: () => new Date(),
    });
    const response = await handler(
      new Request("https://hooky.test/claim", {
        method: "POST",
        body: JSON.stringify({ listenerId: "listener-one" }),
      }),
      "hook-one",
    );

    expect(response.status).toBe(401);
  });

  test("serializes claimed bytes and lease data for the CLI", async () => {
    const handler = createClaimHandler({
      authenticate: authenticated,
      claimDeliveries: async (input) => [
        {
          deliveryId: "delivery-one",
          eventId: "event-one",
          attemptNumber: 1,
          leaseToken: "lease-secret",
          leasedUntil: new Date("2026-08-11T20:00:30.000Z"),
          requestMethod: "POST",
          requestPath: "/stripe",
          query: { attempt: ["1", "2"] },
          headers: { "stripe-signature": "signed" },
          body: Buffer.from([0, 255, 1]),
          receivedAt: new Date("2026-08-11T20:00:00.000Z"),
          ...input,
        },
      ],
      now: () => new Date("2026-08-11T20:00:01.000Z"),
    });
    const response = await handler(
      new Request("https://hooky.test/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          listenerId: "listener-one",
          limit: 5,
          leaseDurationSeconds: 30,
        }),
      }),
      "hook-one",
    );
    const payload = (await response.json()) as {
      deliveries: Array<{ bodyBase64: string; accountId?: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.deliveries[0]?.bodyBase64).toBe("AP8B");
    expect(payload.deliveries[0]?.accountId).toBeUndefined();
  });

  test("ACK, NACK, and heartbeat stay scoped to the authenticated account", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const now = () => new Date("2026-08-11T20:00:10.000Z");
    const acknowledge = createAcknowledgeHandler({
      authenticate: authenticated,
      acknowledgeDelivery: async (input) => {
        calls.push(input);
        return true;
      },
      now,
    });
    const reject = createRejectHandler({
      authenticate: authenticated,
      rejectDelivery: async (input) => {
        calls.push(input);
        return true;
      },
      now,
    });
    const heartbeat = createHeartbeatHandler({
      authenticate: authenticated,
      extendDeliveryLease: async (input) => {
        calls.push(input);
        return new Date("2026-08-11T20:00:40.000Z");
      },
      now,
    });
    const body = (value: Record<string, unknown>) =>
      new Request("https://hooky.test/delivery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(value),
      });

    expect(
      (await acknowledge(body({ leaseToken: "lease-one" }), "delivery-one"))
        .status,
    ).toBe(200);
    expect(
      (
        await reject(
          body({
            leaseToken: "lease-two",
            error: "localhost returned 503",
            retryDelaySeconds: 4,
          }),
          "delivery-two",
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await heartbeat(
          body({ leaseToken: "lease-three", leaseDurationSeconds: 30 }),
          "delivery-three",
        )
      ).status,
    ).toBe(200);
    expect(calls).toEqual([
      {
        accountId: "account-one",
        deliveryId: "delivery-one",
        leaseToken: "lease-one",
        now: now(),
      },
      {
        accountId: "account-one",
        deliveryId: "delivery-two",
        leaseToken: "lease-two",
        error: "localhost returned 503",
        retryAt: new Date("2026-08-11T20:00:14.000Z"),
        now: now(),
      },
      {
        accountId: "account-one",
        deliveryId: "delivery-three",
        leaseToken: "lease-three",
        leaseDurationSeconds: 30,
        now: now(),
      },
    ]);
  });
});
