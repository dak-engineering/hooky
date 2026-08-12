import type { Pool } from "pg";

export class EventStore {
  constructor(private readonly pool: Pool) {}

  async listRecentEvents({
    accountId,
    hookId,
    limit,
  }: {
    accountId: string;
    hookId: string;
    limit: number;
  }) {
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
    const result = await this.pool.query<{
      event_id: string;
      delivery_id: string;
      request_method: string;
      request_path: string;
      status: "pending" | "in_flight" | "delivered" | "dead";
      attempt_count: number;
      received_at: Date;
    }>(
      `
        select
          webhook_events.id as event_id,
          deliveries.id as delivery_id,
          webhook_events.request_method,
          webhook_events.request_path,
          deliveries.status,
          deliveries.attempt_count,
          webhook_events.received_at
        from webhook_events
        inner join deliveries
          on deliveries.event_id = webhook_events.id
          and deliveries.account_id = webhook_events.account_id
        where webhook_events.account_id = $1
          and webhook_events.hook_id = $2
        order by webhook_events.received_at desc, webhook_events.id desc
        limit $3
      `,
      [accountId, hookId, safeLimit],
    );

    return result.rows.map((row) => ({
      eventId: row.event_id,
      deliveryId: row.delivery_id,
      requestMethod: row.request_method,
      requestPath: row.request_path,
      status: row.status,
      attemptCount: row.attempt_count,
      receivedAt: row.received_at,
    }));
  }

  async getEvent({
    accountId,
    eventId,
  }: {
    accountId: string;
    eventId: string;
  }) {
    const eventResult = await this.pool.query<{
      event_id: string;
      hook_id: string;
      delivery_id: string;
      request_method: string;
      request_path: string;
      query: Record<string, string | string[]>;
      headers: Record<string, string | string[]>;
      body: Buffer;
      body_sha256: string;
      received_at: Date;
      status: "pending" | "in_flight" | "delivered" | "dead";
      attempt_count: number;
      delivered_at: Date | null;
      last_error: string | null;
    }>(
      `
        select
          webhook_events.id as event_id,
          webhook_events.hook_id,
          deliveries.id as delivery_id,
          webhook_events.request_method,
          webhook_events.request_path,
          webhook_events.query,
          webhook_events.headers,
          webhook_events.body,
          webhook_events.body_sha256,
          webhook_events.received_at,
          deliveries.status,
          deliveries.attempt_count,
          deliveries.delivered_at,
          deliveries.last_error
        from webhook_events
        inner join deliveries
          on deliveries.event_id = webhook_events.id
          and deliveries.account_id = webhook_events.account_id
        where webhook_events.account_id = $1 and webhook_events.id = $2
      `,
      [accountId, eventId],
    );
    const event = eventResult.rows[0];
    if (!event) {
      return null;
    }

    const attemptsResult = await this.pool.query<{
      attempt_number: number;
      listener_id: string;
      outcome: "delivered" | "failed" | "expired" | null;
      error: string | null;
      started_at: Date;
      finished_at: Date | null;
    }>(
      `
        select attempt_number, listener_id, outcome, error, started_at, finished_at
        from delivery_attempts
        where account_id = $1 and delivery_id = $2
        order by attempt_number
      `,
      [accountId, event.delivery_id],
    );

    return {
      eventId: event.event_id,
      hookId: event.hook_id,
      deliveryId: event.delivery_id,
      requestMethod: event.request_method,
      requestPath: event.request_path,
      query: event.query,
      headers: event.headers,
      body: event.body,
      bodySha256: event.body_sha256,
      receivedAt: event.received_at,
      status: event.status,
      attemptCount: event.attempt_count,
      deliveredAt: event.delivered_at,
      lastError: event.last_error,
      attempts: attemptsResult.rows.map((attempt) => ({
        attemptNumber: attempt.attempt_number,
        listenerId: attempt.listener_id,
        outcome: attempt.outcome,
        error: attempt.error,
        startedAt: attempt.started_at,
        finishedAt: attempt.finished_at,
      })),
    };
  }
}
