import { describe, expect, test } from "bun:test";

import { forwardDelivery, selectHook } from "./listener";

const delivery = {
  deliveryId: "delivery-one",
  eventId: "event-one",
  attemptNumber: 2,
  leaseToken: "lease-secret",
  leasedUntil: "2026-08-11T20:00:30.000Z",
  requestMethod: "POST",
  requestPath: "/stripe",
  query: { attempt: ["1", "2"], source: "stripe" },
  headers: {
    host: "hooky.test",
    "content-length": "4",
    "content-type": "application/octet-stream",
    "stripe-signature": "signed",
  },
  bodyBase64: Buffer.from([0, 255, 1, 2]).toString("base64"),
  receivedAt: "2026-08-11T20:00:00.000Z",
};

describe("listener", () => {
  test("forwards exact bytes and safe headers, then ACKs a success", async () => {
    let localRequest: Request | undefined;
    const acknowledgements: string[] = [];
    await forwardDelivery({
      delivery,
      destination: "http://127.0.0.1:3000/webhooks?configured=yes",
      fetchImplementation: async (input, init) => {
        localRequest = new Request(input, init);
        return new Response(null, { status: 204 });
      },
      acknowledge: async (value) => {
        acknowledgements.push(value.deliveryId);
      },
      reject: async () => {
        throw new Error("must not reject");
      },
    });

    expect(localRequest?.url).toBe(
      "http://127.0.0.1:3000/webhooks?configured=yes&attempt=1&attempt=2&source=stripe",
    );
    expect(localRequest?.headers.get("host")).toBeNull();
    expect(localRequest?.headers.get("stripe-signature")).toBe("signed");
    expect(Buffer.from(await localRequest!.arrayBuffer())).toEqual(
      Buffer.from([0, 255, 1, 2]),
    );
    expect(acknowledgements).toEqual(["delivery-one"]);
  });

  test("NACKs local failures with bounded exponential retry", async () => {
    let rejected:
      | {
          deliveryId: string;
          leaseToken: string;
          error: string;
          retryDelaySeconds: number;
        }
      | undefined;
    await forwardDelivery({
      delivery,
      destination: "http://127.0.0.1:3000/webhooks",
      fetchImplementation: async () => new Response("down", { status: 503 }),
      acknowledge: async () => {
        throw new Error("must not acknowledge");
      },
      reject: async (value) => {
        rejected = value;
      },
    });

    expect(rejected).toEqual({
      deliveryId: "delivery-one",
      leaseToken: "lease-secret",
      error: "Local destination returned 503",
      retryDelaySeconds: 2,
    });
  });

  test("selects an existing hook or creates one on request", async () => {
    const hooks = [
      { hookId: "hook-one", name: "stripe-dev", state: "active" as const },
      { hookId: "hook-two", name: "github-dev", state: "active" as const },
    ];

    expect(
      await selectHook({
        selector: "stripe-dev",
        createName: undefined,
        listHooks: async () => hooks,
        createHook: async () => {
          throw new Error("must not create");
        },
      }),
    ).toMatchObject({ hookId: "hook-one" });
    expect(
      await selectHook({
        selector: undefined,
        createName: "linear-dev",
        listHooks: async () => hooks,
        createHook: async (name) => ({
          hookId: "hook-three",
          name,
          state: "active" as const,
          ingressUrl: "https://hooky.test/e/new",
        }),
      }),
    ).toMatchObject({ hookId: "hook-three" });
  });
});
