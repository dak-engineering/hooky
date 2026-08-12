import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool } from "pg";

const ingressTokenPattern = /^hk_([a-f0-9]{32})_([A-Za-z0-9_-]{43})$/;

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function toCompactUuid(id: string) {
  return id.replaceAll("-", "");
}

function fromCompactUuid(id: string) {
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

function createIngressToken(hookId: string) {
  const secret = randomBytes(32).toString("base64url");
  return {
    ingressToken: `hk_${toCompactUuid(hookId)}_${secret}`,
    secretHash: hashSecret(secret),
  };
}

export class HookStore {
  constructor(private readonly pool: Pool) {}

  async createHook({ accountId, name }: { accountId: string; name: string }) {
    const normalizedName = name.trim();
    if (normalizedName.length < 1 || normalizedName.length > 80) {
      throw new Error("Hook name must be between 1 and 80 characters");
    }

    const hookId = randomUUID();
    const { ingressToken, secretHash } = createIngressToken(hookId);
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      const result = await client.query<{
        created_at: Date;
        name: string;
        state: "active" | "disabled";
      }>(
        `
          insert into hooks (id, account_id, name)
          values ($1, $2, $3)
          returning name, state, created_at
        `,
        [hookId, accountId, normalizedName],
      );
      await client.query(
        `
          insert into hook_secrets (hook_id, account_id, ingress_secret_hash)
          values ($1, $2, $3)
        `,
        [hookId, accountId, secretHash],
      );
      await client.query("commit");

      return {
        hookId,
        name: result.rows[0]!.name,
        state: result.rows[0]!.state,
        createdAt: result.rows[0]!.created_at,
        ingressToken,
      };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async listHooks({ accountId }: { accountId: string }) {
    const result = await this.pool.query<{
      id: string;
      name: string;
      state: "active" | "disabled";
      created_at: Date;
      updated_at: Date;
    }>(
      `
        select id, name, state, created_at, updated_at
        from hooks
        where account_id = $1
        order by created_at desc, id
      `,
      [accountId],
    );

    return result.rows.map((row) => ({
      hookId: row.id,
      name: row.name,
      state: row.state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async rotateIngressSecret({
    accountId,
    hookId,
  }: {
    accountId: string;
    hookId: string;
  }) {
    const { ingressToken, secretHash } = createIngressToken(hookId);
    const result = await this.pool.query<{ hook_id: string }>(
      `
        update hook_secrets
        set ingress_secret_hash = $3, rotated_at = now()
        where account_id = $1 and hook_id = $2
        returning hook_id
      `,
      [accountId, hookId, secretHash],
    );

    if (!result.rows[0]) {
      throw new Error("Hook not found");
    }

    return { hookId, ingressToken };
  }

  async resolveIngressToken(token: string) {
    const match = ingressTokenPattern.exec(token);
    if (!match) {
      return null;
    }

    const [, compactHookId, secret] = match;
    const result = await this.pool.query<{
      account_id: string;
      hook_id: string;
    }>(
      `
        select hook_secrets.account_id, hook_secrets.hook_id
        from hook_secrets
        inner join hooks
          on hooks.id = hook_secrets.hook_id
          and hooks.account_id = hook_secrets.account_id
        where hook_secrets.hook_id = $1
          and hook_secrets.ingress_secret_hash = $2
          and hooks.state = 'active'
      `,
      [fromCompactUuid(compactHookId!), hashSecret(secret!)],
    );

    const resolved = result.rows[0];
    return resolved
      ? { accountId: resolved.account_id, hookId: resolved.hook_id }
      : null;
  }
}
