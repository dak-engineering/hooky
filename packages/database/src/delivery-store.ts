import { createHash } from "node:crypto";

import type { Pool } from "pg";

export class HookUnavailableError extends Error {
  constructor() {
    super(
      "The hook does not exist, is disabled, or belongs to another account",
    );
    this.name = "HookUnavailableError";
  }
}

export type ClaimedDelivery = {
  deliveryId: string;
  eventId: string;
  attemptNumber: number;
  leaseToken: string;
  leasedUntil: Date;
  requestMethod: string;
  requestPath: string;
  query: Record<string, string | string[]>;
  headers: Record<string, string | string[]>;
  body: Buffer;
  receivedAt: Date;
};

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function clampInteger(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}

export class DeliveryStore {
  constructor(private readonly pool: Pool) {}

  async recordWebhookEvent({
    accountId,
    hookId,
    requestMethod,
    requestPath,
    query,
    headers,
    body,
    receivedAt,
  }: {
    accountId: string;
    hookId: string;
    requestMethod: string;
    requestPath: string;
    query: Record<string, string | string[]>;
    headers: Record<string, string | string[]>;
    body: Buffer;
    receivedAt: Date;
  }) {
    const eventId = crypto.randomUUID();
    const deliveryId = crypto.randomUUID();
    const bodySha256 = createHash("sha256").update(body).digest("hex");
    const result = await this.pool.query<{
      event_id: string;
      delivery_id: string;
    }>(
      `
        with owned_hook as (
          select id
          from hooks
          where id = $1
            and account_id = $2
            and state = 'active'
        ), inserted_event as (
          insert into webhook_events (
            id,
            account_id,
            hook_id,
            request_method,
            request_path,
            query,
            headers,
            body,
            body_sha256,
            received_at
          )
          select $3, $2, owned_hook.id, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11
          from owned_hook
          returning id
        ), inserted_delivery as (
          insert into deliveries (
            id,
            account_id,
            hook_id,
            event_id,
            available_at
          )
          select $4, $2, $1, inserted_event.id, $11
          from inserted_event
          returning id
        )
        select inserted_event.id as event_id, inserted_delivery.id as delivery_id
        from inserted_event
        cross join inserted_delivery
      `,
      [
        hookId,
        accountId,
        eventId,
        deliveryId,
        requestMethod,
        requestPath,
        JSON.stringify(query),
        JSON.stringify(headers),
        body,
        bodySha256,
        receivedAt,
      ],
    );

    const recorded = result.rows[0];
    if (!recorded) {
      throw new HookUnavailableError();
    }

    return {
      eventId: recorded.event_id,
      deliveryId: recorded.delivery_id,
    };
  }

  async claimDeliveries({
    accountId,
    hookId,
    listenerId,
    limit,
    leaseDurationSeconds,
    now,
  }: {
    accountId: string;
    hookId: string;
    listenerId: string;
    limit: number;
    leaseDurationSeconds: number;
    now: Date;
  }): Promise<ClaimedDelivery[]> {
    const claimLimit = clampInteger(limit, 1, 10);
    const leaseSeconds = clampInteger(leaseDurationSeconds, 1, 3600);
    const result = await this.pool.query<{
      delivery_id: string;
      event_id: string;
      attempt_number: number;
      lease_token: string;
      leased_until: Date;
      request_method: string;
      request_path: string;
      query: Record<string, string | string[]>;
      headers: Record<string, string | string[]>;
      body: Buffer;
      received_at: Date;
    }>(
      `
        with candidates as materialized (
          select deliveries.id
          from deliveries
          inner join hooks
            on hooks.id = deliveries.hook_id
            and hooks.account_id = deliveries.account_id
          where deliveries.account_id = $1
            and deliveries.hook_id = $2
            and hooks.state = 'active'
            and (
              (deliveries.status = 'pending' and deliveries.available_at <= $3)
              or (
                deliveries.status = 'in_flight'
                and deliveries.leased_until <= $3
              )
            )
          order by deliveries.available_at, deliveries.created_at, deliveries.id
          for update of deliveries skip locked
          limit $4
        ), expired_attempts as (
          update delivery_attempts
          set outcome = 'expired', finished_at = $3
          from deliveries
          where delivery_attempts.delivery_id = deliveries.id
            and deliveries.id in (select id from candidates)
            and deliveries.status = 'in_flight'
            and deliveries.leased_until <= $3
            and delivery_attempts.outcome is null
          returning delivery_attempts.id
        ), lease_values as (
          select
            candidates.id,
            replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') as lease_token
          from candidates
        ), claimed as (
          update deliveries
          set
            status = 'in_flight',
            attempt_count = deliveries.attempt_count + 1,
            leased_by = $5,
            lease_token_hash = encode(digest(lease_values.lease_token, 'sha256'), 'hex'),
            leased_until = $3::timestamptz + make_interval(secs => $6::double precision),
            updated_at = $3
          from lease_values
          where deliveries.id = lease_values.id
          returning
            deliveries.id as delivery_id,
            deliveries.account_id,
            deliveries.event_id,
            deliveries.attempt_count as attempt_number,
            deliveries.lease_token_hash,
            deliveries.leased_until,
            lease_values.lease_token
        ), inserted_attempts as (
          insert into delivery_attempts (
            account_id,
            delivery_id,
            attempt_number,
            listener_id,
            lease_token_hash,
            started_at
          )
          select
            claimed.account_id,
            claimed.delivery_id,
            claimed.attempt_number,
            $5,
            claimed.lease_token_hash,
            $3
          from claimed
          returning delivery_id
        )
        select
          claimed.delivery_id,
          claimed.event_id,
          claimed.attempt_number,
          claimed.lease_token,
          claimed.leased_until,
          webhook_events.request_method,
          webhook_events.request_path,
          webhook_events.query,
          webhook_events.headers,
          webhook_events.body,
          webhook_events.received_at
        from claimed
        inner join webhook_events on webhook_events.id = claimed.event_id
        order by webhook_events.received_at, claimed.delivery_id
      `,
      [accountId, hookId, now, claimLimit, listenerId, leaseSeconds],
    );

    return result.rows.map((row) => ({
      deliveryId: row.delivery_id,
      eventId: row.event_id,
      attemptNumber: row.attempt_number,
      leaseToken: row.lease_token,
      leasedUntil: row.leased_until,
      requestMethod: row.request_method,
      requestPath: row.request_path,
      query: row.query,
      headers: row.headers,
      body: row.body,
      receivedAt: row.received_at,
    }));
  }

  async acknowledgeDelivery({
    accountId,
    deliveryId,
    leaseToken,
    now,
  }: {
    accountId: string;
    deliveryId: string;
    leaseToken: string;
    now: Date;
  }) {
    const result = await this.pool.query<{ accepted: boolean }>(
      `
        with accepted_delivery as (
          update deliveries
          set
            status = 'delivered',
            delivered_at = $4,
            leased_by = null,
            lease_token_hash = null,
            leased_until = null,
            last_error = null,
            updated_at = $4
          where account_id = $1
            and id = $2
            and status = 'in_flight'
            and lease_token_hash = $3
            and leased_until > $4
          returning id, attempt_count
        ), completed_attempt as (
          update delivery_attempts
          set outcome = 'delivered', finished_at = $4
          from accepted_delivery
          where delivery_attempts.delivery_id = accepted_delivery.id
            and delivery_attempts.attempt_number = accepted_delivery.attempt_count
          returning delivery_attempts.id
        )
        select exists(select 1 from accepted_delivery) as accepted
      `,
      [accountId, deliveryId, hashToken(leaseToken), now],
    );

    return result.rows[0]?.accepted ?? false;
  }

  async rejectDelivery({
    accountId,
    deliveryId,
    leaseToken,
    error,
    retryAt,
    now,
  }: {
    accountId: string;
    deliveryId: string;
    leaseToken: string;
    error: string;
    retryAt: Date;
    now: Date;
  }) {
    const result = await this.pool.query<{ accepted: boolean }>(
      `
        with rejected_delivery as (
          update deliveries
          set
            status = 'pending',
            available_at = $5,
            leased_by = null,
            lease_token_hash = null,
            leased_until = null,
            last_error = $4,
            updated_at = $6
          where account_id = $1
            and id = $2
            and status = 'in_flight'
            and lease_token_hash = $3
            and leased_until > $6
          returning id, attempt_count
        ), failed_attempt as (
          update delivery_attempts
          set outcome = 'failed', error = $4, finished_at = $6
          from rejected_delivery
          where delivery_attempts.delivery_id = rejected_delivery.id
            and delivery_attempts.attempt_number = rejected_delivery.attempt_count
          returning delivery_attempts.id
        )
        select exists(select 1 from rejected_delivery) as accepted
      `,
      [accountId, deliveryId, hashToken(leaseToken), error, retryAt, now],
    );

    return result.rows[0]?.accepted ?? false;
  }

  async extendDeliveryLease({
    accountId,
    deliveryId,
    leaseToken,
    leaseDurationSeconds,
    now,
  }: {
    accountId: string;
    deliveryId: string;
    leaseToken: string;
    leaseDurationSeconds: number;
    now: Date;
  }) {
    const leaseSeconds = clampInteger(leaseDurationSeconds, 1, 3600);
    const result = await this.pool.query<{ leased_until: Date }>(
      `
        update deliveries
        set
          leased_until = greatest(
            leased_until,
            $4::timestamptz + make_interval(secs => $5::double precision)
          ),
          updated_at = $4
        where account_id = $1
          and id = $2
          and status = 'in_flight'
          and lease_token_hash = $3
          and leased_until > $4
        returning leased_until
      `,
      [accountId, deliveryId, hashToken(leaseToken), now, leaseSeconds],
    );

    return result.rows[0]?.leased_until;
  }
}
