import type {
  ClaimedDelivery,
  FetchImplementation,
  HookSummary,
} from "./api-client";

const hopByHopHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function destinationUrl(
  destination: string,
  query: Record<string, string | string[]>,
) {
  const url = new URL(destination);
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      url.searchParams.append(key, item);
    }
  }
  return url;
}

function forwardedHeaders(headers: Record<string, string | string[]>) {
  const result = new Headers();
  for (const [name, value] of Object.entries(headers)) {
    if (hopByHopHeaders.has(name.toLowerCase())) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      result.append(name, item);
    }
  }
  return result;
}

function retryDelay(attemptNumber: number) {
  return Math.min(60, 2 ** Math.max(0, attemptNumber - 1));
}

export async function forwardDelivery({
  delivery,
  destination,
  fetchImplementation,
  acknowledge,
  reject,
}: {
  delivery: ClaimedDelivery;
  destination: string;
  fetchImplementation: FetchImplementation;
  acknowledge: (input: {
    deliveryId: string;
    leaseToken: string;
  }) => Promise<void>;
  reject: (input: {
    deliveryId: string;
    leaseToken: string;
    error: string;
    retryDelaySeconds: number;
  }) => Promise<void>;
}) {
  try {
    const response = await fetchImplementation(
      destinationUrl(destination, delivery.query),
      {
        method: delivery.requestMethod,
        headers: forwardedHeaders(delivery.headers),
        body: ["GET", "HEAD"].includes(delivery.requestMethod)
          ? undefined
          : Buffer.from(delivery.bodyBase64, "base64"),
        redirect: "manual",
      },
    );

    if (response.ok) {
      await acknowledge({
        deliveryId: delivery.deliveryId,
        leaseToken: delivery.leaseToken,
      });
      return { delivered: true, status: response.status };
    }

    const error = `Local destination returned ${response.status}`;
    await reject({
      deliveryId: delivery.deliveryId,
      leaseToken: delivery.leaseToken,
      error,
      retryDelaySeconds: retryDelay(delivery.attemptNumber),
    });
    return { delivered: false, status: response.status, error };
  } catch (cause) {
    const error = `Local destination was unreachable: ${cause instanceof Error ? cause.message : String(cause)}`;
    await reject({
      deliveryId: delivery.deliveryId,
      leaseToken: delivery.leaseToken,
      error,
      retryDelaySeconds: retryDelay(delivery.attemptNumber),
    });
    return { delivered: false, error };
  }
}

export async function selectHook({
  selector,
  createName,
  listHooks,
  createHook,
}: {
  selector: string | undefined;
  createName: string | undefined;
  listHooks: () => Promise<HookSummary[]>;
  createHook: (name: string) => Promise<HookSummary & { ingressUrl: string }>;
}) {
  if (selector && createName) {
    throw new Error("Use either --hook or --new, not both");
  }
  if (createName) {
    return createHook(createName);
  }

  const activeHooks = (await listHooks()).filter(
    (hook) => hook.state === "active",
  );
  if (selector) {
    const selected = activeHooks.find(
      (hook) => hook.hookId === selector || hook.name === selector,
    );
    if (!selected) {
      throw new Error(`No active hook matches "${selector}"`);
    }
    return selected;
  }
  if (activeHooks.length === 1) {
    return activeHooks[0]!;
  }
  if (activeHooks.length === 0) {
    return createHook("local");
  }
  throw new Error("Multiple hooks exist; choose one with --hook <name-or-id>");
}

function waitForPoll(signal: AbortSignal, delayMilliseconds: number) {
  return new Promise<void>((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timeout = setTimeout(resolve, delayMilliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

export async function listenForDeliveries({
  hookId,
  destination,
  signal,
  client,
  fetchImplementation = fetch,
  onResult = () => undefined,
}: {
  hookId: string;
  destination: string;
  signal: AbortSignal;
  client: {
    claimDeliveries: (input: {
      hookId: string;
      listenerId: string;
      limit: number;
      leaseDurationSeconds: number;
    }) => Promise<ClaimedDelivery[]>;
    acknowledge: (input: {
      deliveryId: string;
      leaseToken: string;
    }) => Promise<void>;
    reject: (input: {
      deliveryId: string;
      leaseToken: string;
      error: string;
      retryDelaySeconds: number;
    }) => Promise<void>;
    heartbeat: (input: {
      deliveryId: string;
      leaseToken: string;
      leaseDurationSeconds: number;
    }) => Promise<void>;
  };
  fetchImplementation?: FetchImplementation;
  onResult?: (result: {
    deliveryId: string;
    delivered: boolean;
    status?: number;
    error?: string;
  }) => void;
}) {
  const listenerId = `cli-${crypto.randomUUID()}`;

  while (!signal.aborted) {
    const deliveries = await client.claimDeliveries({
      hookId,
      listenerId,
      limit: 5,
      leaseDurationSeconds: 30,
    });
    if (deliveries.length === 0) {
      await waitForPoll(signal, 750);
      continue;
    }

    for (const delivery of deliveries) {
      if (signal.aborted) {
        return;
      }
      const heartbeat = setInterval(() => {
        void client
          .heartbeat({
            deliveryId: delivery.deliveryId,
            leaseToken: delivery.leaseToken,
            leaseDurationSeconds: 30,
          })
          .catch(() => undefined);
      }, 10_000);

      try {
        const result = await forwardDelivery({
          delivery,
          destination,
          fetchImplementation,
          acknowledge: (input) => client.acknowledge(input),
          reject: (input) => client.reject(input),
        });
        onResult({ deliveryId: delivery.deliveryId, ...result });
      } finally {
        clearInterval(heartbeat);
      }
    }
  }
}
