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
}) {
  return async function handleIngress(
    request: Request,
    { token, path }: { token: string; path: string[] },
  ) {
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }

    const resolved = await resolveIngressToken(token);
    if (!resolved) {
      return Response.json(
        { error: "Webhook endpoint not found" },
        { status: 404 },
      );
    }

    const body = Buffer.from(await request.arrayBuffer());
    if (body.byteLength > maxBodyBytes) {
      return Response.json({ error: "Payload too large" }, { status: 413 });
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

      return Response.json(recorded, {
        status: 202,
        headers: { "cache-control": "no-store" },
      });
    } catch {
      return Response.json(
        { error: "Webhook could not be durably accepted" },
        { status: 503 },
      );
    }
  };
}
