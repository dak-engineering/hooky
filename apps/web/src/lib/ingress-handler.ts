type RecordedWebhook = {
  eventId: string;
  deliveryId: string;
};

type ResolvedHook = {
  accountId: string;
  hookId: string;
};

function collectQuery(searchParams: URLSearchParams) {
  const query: Record<string, string | string[]> = {};

  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    query[key] = values.length === 1 ? values[0]! : values;
  }

  return query;
}

function collectHeaders(headers: Headers) {
  return Object.fromEntries(headers.entries());
}

export function createIngressHandler({
  maxBodyBytes,
  resolveIngressToken,
  recordWebhookEvent,
  log = (entry) => console.log(JSON.stringify(entry)),
}: {
  maxBodyBytes: number;
  resolveIngressToken: (token: string) => Promise<ResolvedHook | null>;
  recordWebhookEvent: (input: {
    accountId: string;
    hookId: string;
    requestMethod: string;
    requestPath: string;
    query: Record<string, string | string[]>;
    headers: Record<string, string>;
    body: Buffer;
    receivedAt: Date;
  }) => Promise<RecordedWebhook>;
  log?: (entry: Record<string, unknown>) => void;
}) {
  return async function handleIngress(
    request: Request,
    { token, path }: { token: string; path: string[] },
  ) {
    const startedAt = Date.now();
    const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();
    const responseHeaders = {
      "cache-control": "no-store",
      "x-request-id": requestId,
    };
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      return Response.json(
        { error: "Payload too large" },
        { status: 413, headers: responseHeaders },
      );
    }

    const resolved = await resolveIngressToken(token);
    if (!resolved) {
      return Response.json(
        { error: "Webhook endpoint not found" },
        { status: 404, headers: responseHeaders },
      );
    }

    const body = Buffer.from(await request.arrayBuffer());
    if (body.byteLength > maxBodyBytes) {
      return Response.json(
        { error: "Payload too large" },
        { status: 413, headers: responseHeaders },
      );
    }

    try {
      const recorded = await recordWebhookEvent({
        ...resolved,
        requestMethod: request.method,
        requestPath: `/${path.join("/")}`,
        query: collectQuery(new URL(request.url).searchParams),
        headers: collectHeaders(request.headers),
        body,
        receivedAt: new Date(),
      });

      log({
        level: "info",
        message: "webhook.accepted",
        requestId,
        eventId: recorded.eventId,
        hookId: resolved.hookId,
        method: request.method,
        bodyBytes: body.byteLength,
        durationMs: Date.now() - startedAt,
      });

      return Response.json(recorded, {
        status: 202,
        headers: responseHeaders,
      });
    } catch (error) {
      log({
        level: "error",
        message: "webhook.failed",
        requestId,
        hookId: resolved.hookId,
        method: request.method,
        bodyBytes: body.byteLength,
        errorType: error instanceof Error ? error.name : "UnknownError",
        durationMs: Date.now() - startedAt,
      });
      return Response.json(
        { error: "Webhook could not be durably accepted" },
        { status: 503, headers: responseHeaders },
      );
    }
  };
}
