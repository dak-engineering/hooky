const millisecondsPerDay = 24 * 60 * 60 * 1000;

function clampRetentionDays(value: number) {
  return Math.min(365, Math.max(1, Math.trunc(value)));
}

export function createRetentionHandler({
  cronSecret,
  retentionDays,
  deleteEventsReceivedBefore,
  now = () => new Date(),
  log = (entry) => console.log(JSON.stringify(entry)),
}: {
  cronSecret: string | undefined;
  retentionDays: number;
  deleteEventsReceivedBefore: (input: {
    before: Date;
    limit: number;
  }) => Promise<{ deleted: number }>;
  now?: () => Date;
  log?: (entry: Record<string, unknown>) => void;
}) {
  return async function handleRetention(request: Request) {
    const startedAt = Date.now();
    const requestId = request.headers.get("x-vercel-id") ?? crypto.randomUUID();

    if (
      !cronSecret ||
      request.headers.get("authorization") !== `Bearer ${cronSecret}`
    ) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401, headers: { "x-request-id": requestId } },
      );
    }

    const safeRetentionDays = clampRetentionDays(retentionDays);
    const before = new Date(
      now().getTime() - safeRetentionDays * millisecondsPerDay,
    );
    const result = await deleteEventsReceivedBefore({
      before,
      limit: 10_000,
    });

    log({
      level: "info",
      message: "retention.completed",
      requestId,
      deleted: result.deleted,
      retentionDays: safeRetentionDays,
      durationMs: Date.now() - startedAt,
    });

    return Response.json(
      { ...result, retentionDays: safeRetentionDays },
      { headers: { "cache-control": "no-store", "x-request-id": requestId } },
    );
  };
}
