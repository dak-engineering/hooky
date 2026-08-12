import type { ClaimedDelivery } from "@hooky/database";
import { z } from "zod";

const claimInput = z.object({
  listenerId: z.string().trim().min(1).max(128),
  limit: z.number().int().min(1).max(10).default(5),
  leaseDurationSeconds: z.number().int().min(10).max(300).default(30),
});
const leaseInput = z.object({
  leaseToken: z.string().min(1).max(256),
});
const rejectInput = leaseInput.extend({
  error: z.string().trim().min(1).max(1_000),
  retryDelaySeconds: z.number().int().min(1).max(3_600).default(1),
});
const heartbeatInput = leaseInput.extend({
  leaseDurationSeconds: z.number().int().min(10).max(300).default(30),
});

type Authentication = { accountId: string } | null;

function unauthorized() {
  return Response.json({ error: "Authentication required" }, { status: 401 });
}

async function parseJson<T extends z.ZodType>(request: Request, schema: T) {
  return schema.safeParse(await request.json().catch(() => undefined));
}

function invalidInput() {
  return Response.json({ error: "Invalid request body" }, { status: 400 });
}

function serializeDelivery(delivery: ClaimedDelivery) {
  return {
    deliveryId: delivery.deliveryId,
    eventId: delivery.eventId,
    attemptNumber: delivery.attemptNumber,
    leaseToken: delivery.leaseToken,
    leasedUntil: delivery.leasedUntil,
    requestMethod: delivery.requestMethod,
    requestPath: delivery.requestPath,
    query: delivery.query,
    headers: delivery.headers,
    bodyBase64: delivery.body.toString("base64"),
    receivedAt: delivery.receivedAt,
  };
}

export function createClaimHandler({
  authenticate,
  claimDeliveries,
  now,
}: {
  authenticate: (request: Request) => Promise<Authentication>;
  claimDeliveries: (input: {
    accountId: string;
    hookId: string;
    listenerId: string;
    limit: number;
    leaseDurationSeconds: number;
    now: Date;
  }) => Promise<ClaimedDelivery[]>;
  now: () => Date;
}) {
  return async function claim(request: Request, hookId: string) {
    const authentication = await authenticate(request);
    if (!authentication) {
      return unauthorized();
    }
    const input = await parseJson(request, claimInput);
    if (!input.success) {
      return invalidInput();
    }

    const deliveries = await claimDeliveries({
      accountId: authentication.accountId,
      hookId,
      ...input.data,
      now: now(),
    });
    return Response.json({ deliveries: deliveries.map(serializeDelivery) });
  };
}

export function createAcknowledgeHandler({
  authenticate,
  acknowledgeDelivery,
  now,
}: {
  authenticate: (request: Request) => Promise<Authentication>;
  acknowledgeDelivery: (input: {
    accountId: string;
    deliveryId: string;
    leaseToken: string;
    now: Date;
  }) => Promise<boolean>;
  now: () => Date;
}) {
  return async function acknowledge(request: Request, deliveryId: string) {
    const authentication = await authenticate(request);
    if (!authentication) {
      return unauthorized();
    }
    const input = await parseJson(request, leaseInput);
    if (!input.success) {
      return invalidInput();
    }

    const accepted = await acknowledgeDelivery({
      accountId: authentication.accountId,
      deliveryId,
      leaseToken: input.data.leaseToken,
      now: now(),
    });
    return Response.json({ accepted }, { status: accepted ? 200 : 409 });
  };
}

export function createRejectHandler({
  authenticate,
  rejectDelivery,
  now,
}: {
  authenticate: (request: Request) => Promise<Authentication>;
  rejectDelivery: (input: {
    accountId: string;
    deliveryId: string;
    leaseToken: string;
    error: string;
    retryAt: Date;
    now: Date;
  }) => Promise<boolean>;
  now: () => Date;
}) {
  return async function reject(request: Request, deliveryId: string) {
    const authentication = await authenticate(request);
    if (!authentication) {
      return unauthorized();
    }
    const input = await parseJson(request, rejectInput);
    if (!input.success) {
      return invalidInput();
    }

    const requestTime = now();
    const accepted = await rejectDelivery({
      accountId: authentication.accountId,
      deliveryId,
      leaseToken: input.data.leaseToken,
      error: input.data.error,
      retryAt: new Date(
        requestTime.getTime() + input.data.retryDelaySeconds * 1_000,
      ),
      now: requestTime,
    });
    return Response.json({ accepted }, { status: accepted ? 200 : 409 });
  };
}

export function createHeartbeatHandler({
  authenticate,
  extendDeliveryLease,
  now,
}: {
  authenticate: (request: Request) => Promise<Authentication>;
  extendDeliveryLease: (input: {
    accountId: string;
    deliveryId: string;
    leaseToken: string;
    leaseDurationSeconds: number;
    now: Date;
  }) => Promise<Date | null>;
  now: () => Date;
}) {
  return async function heartbeat(request: Request, deliveryId: string) {
    const authentication = await authenticate(request);
    if (!authentication) {
      return unauthorized();
    }
    const input = await parseJson(request, heartbeatInput);
    if (!input.success) {
      return invalidInput();
    }

    const leasedUntil = await extendDeliveryLease({
      accountId: authentication.accountId,
      deliveryId,
      ...input.data,
      now: now(),
    });
    return Response.json(
      { accepted: Boolean(leasedUntil), leasedUntil },
      { status: leasedUntil ? 200 : 409 },
    );
  };
}
