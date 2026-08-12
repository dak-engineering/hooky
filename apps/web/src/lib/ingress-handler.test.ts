import { describe, expect, test } from "bun:test";

import { createIngressHandler } from "./ingress-handler";

describe("ingress handler", () => {
  test("commits exact request data before returning 202", async () => {
    const calls: string[] = [];
    const body = new Uint8Array([0, 255, 1, 2, 3]);
    const handler = createIngressHandler({
      maxBodyBytes: 1024,
      resolveIngressToken: async (token) => {
        calls.push(`resolve:${token}`);
        return { accountId: "account-one", hookId: "hook-one" };
      },
      recordWebhookEvent: async (input) => {
        calls.push("record:start");
        expect(input).toMatchObject({
          accountId: "account-one",
          hookId: "hook-one",
          requestMethod: "POST",
          requestPath: "/orders/complete",
          query: { attempt: ["1", "2"], source: "stripe" },
        });
        expect(input.body).toEqual(Buffer.from(body));
        await Bun.sleep(5);
        calls.push("record:committed");
        return { eventId: "event-one", deliveryId: "delivery-one" };
      },
    });

    const response = await handler(
      new Request(
        "https://hooky.test/e/hk_token/orders/complete?attempt=1&attempt=2&source=stripe",
        {
          method: "POST",
          headers: { "content-type": "application/octet-stream" },
          body,
        },
      ),
      { token: "hk_token", path: ["orders", "complete"] },
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(await response.json()).toEqual({
      deliveryId: "delivery-one",
      eventId: "event-one",
    });
    expect(calls).toEqual([
      "resolve:hk_token",
      "record:start",
      "record:committed",
    ]);
  });

  test("preserves an upstream Vercel request id for correlation", async () => {
    const logs: Record<string, unknown>[] = [];
    const handler = createIngressHandler({
      maxBodyBytes: 1024,
      resolveIngressToken: async () => ({
        accountId: "account-one",
        hookId: "hook-one",
      }),
      recordWebhookEvent: async () => ({
        eventId: "event-one",
        deliveryId: "delivery-one",
      }),
      log: (entry) => logs.push(entry),
    });

    const response = await handler(
      new Request("https://hooky.test/e/token", {
        method: "POST",
        headers: { "x-vercel-id": "sfo1::abc-123" },
      }),
      { token: "token", path: [] },
    );

    expect(response.headers.get("x-request-id")).toBe("sfo1::abc-123");
    expect(logs).toEqual([
      expect.objectContaining({
        level: "info",
        message: "webhook.accepted",
        requestId: "sfo1::abc-123",
        method: "POST",
        bodyBytes: 0,
      }),
    ]);
  });

  test("rejects unknown tokens without recording", async () => {
    let recorded = false;
    const handler = createIngressHandler({
      maxBodyBytes: 1024,
      resolveIngressToken: async () => null,
      recordWebhookEvent: async () => {
        recorded = true;
        return { eventId: "event", deliveryId: "delivery" };
      },
    });

    const response = await handler(
      new Request("https://hooky.test/e/nope", { method: "POST" }),
      { token: "nope", path: [] },
    );

    expect(response.status).toBe(404);
    expect(recorded).toBe(false);
  });

  test("rejects bodies over the configured limit", async () => {
    const handler = createIngressHandler({
      maxBodyBytes: 4,
      resolveIngressToken: async () => ({
        accountId: "account-one",
        hookId: "hook-one",
      }),
      recordWebhookEvent: async () => ({
        eventId: "event",
        deliveryId: "delivery",
      }),
    });

    const response = await handler(
      new Request("https://hooky.test/e/token", {
        method: "POST",
        body: "12345",
      }),
      { token: "token", path: [] },
    );

    expect(response.status).toBe(413);
  });

  test("returns 503 if the durable commit fails", async () => {
    const handler = createIngressHandler({
      maxBodyBytes: 1024,
      resolveIngressToken: async () => ({
        accountId: "account-one",
        hookId: "hook-one",
      }),
      recordWebhookEvent: async () => {
        throw new Error("database unavailable");
      },
    });

    const response = await handler(
      new Request("https://hooky.test/e/token", { method: "POST" }),
      { token: "token", path: [] },
    );

    expect(response.status).toBe(503);
  });
});
