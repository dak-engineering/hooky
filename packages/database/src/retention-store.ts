import type { Pool } from "pg";

function clampLimit(value: number) {
  return Math.min(10_000, Math.max(1, Math.trunc(value)));
}

export class RetentionStore {
  constructor(private readonly pool: Pool) {}

  async deleteEventsReceivedBefore({
    before,
    limit,
  }: {
    before: Date;
    limit: number;
  }) {
    const result = await this.pool.query<{ id: string }>(
      `
        with candidates as materialized (
          select id
          from webhook_events
          where received_at < $1
          order by received_at, id
          limit $2
        )
        delete from webhook_events
        using candidates
        where webhook_events.id = candidates.id
        returning webhook_events.id
      `,
      [before, clampLimit(limit)],
    );

    return { deleted: result.rowCount ?? 0 };
  }
}
