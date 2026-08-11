import { createHash, randomBytes, randomUUID } from "node:crypto";

import type { Pool } from "pg";

const apiTokenPattern = /^hky_([a-f0-9]{32})_([A-Za-z0-9_-]{43})$/;

function hashSecret(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

function compactUuid(id: string) {
  return id.replaceAll("-", "");
}

function expandUuid(id: string) {
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

export class ApiTokenStore {
  constructor(private readonly pool: Pool) {}

  async createToken({ accountId, name }: { accountId: string; name: string }) {
    const normalizedName = name.trim();
    if (normalizedName.length < 1 || normalizedName.length > 80) {
      throw new Error("Token name must be between 1 and 80 characters");
    }

    const tokenId = randomUUID();
    const secret = randomBytes(32).toString("base64url");
    const token = `hky_${compactUuid(tokenId)}_${secret}`;
    const prefix = token.slice(0, 12);
    const result = await this.pool.query<{ created_at: Date }>(
      `
        insert into api_tokens (id, account_id, name, prefix, token_hash)
        values ($1, $2, $3, $4, $5)
        returning created_at
      `,
      [tokenId, accountId, normalizedName, prefix, hashSecret(secret)],
    );

    return {
      tokenId,
      name: normalizedName,
      prefix,
      token,
      createdAt: result.rows[0]!.created_at,
    };
  }

  async authenticateToken(token: string) {
    const match = apiTokenPattern.exec(token);
    if (!match) {
      return null;
    }

    const [, compactId, secret] = match;
    const result = await this.pool.query<{
      account_id: string;
      id: string;
    }>(
      `
        update api_tokens
        set last_used_at = now()
        where id = $1
          and token_hash = $2
          and revoked_at is null
          and (expires_at is null or expires_at > now())
        returning id, account_id
      `,
      [expandUuid(compactId!), hashSecret(secret!)],
    );
    const authenticated = result.rows[0];
    return authenticated
      ? { tokenId: authenticated.id, accountId: authenticated.account_id }
      : null;
  }

  async listTokens({ accountId }: { accountId: string }) {
    const result = await this.pool.query<{
      id: string;
      name: string;
      prefix: string;
      last_used_at: Date | null;
      expires_at: Date | null;
      revoked_at: Date | null;
      created_at: Date;
    }>(
      `
        select id, name, prefix, last_used_at, expires_at, revoked_at, created_at
        from api_tokens
        where account_id = $1
        order by created_at desc, id
      `,
      [accountId],
    );

    return result.rows.map((row) => ({
      tokenId: row.id,
      name: row.name,
      prefix: row.prefix,
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
    }));
  }

  async revokeToken({
    accountId,
    tokenId,
  }: {
    accountId: string;
    tokenId: string;
  }) {
    const result = await this.pool.query(
      `
        update api_tokens
        set revoked_at = coalesce(revoked_at, now())
        where account_id = $1 and id = $2 and revoked_at is null
      `,
      [accountId, tokenId],
    );
    return result.rowCount === 1;
  }
}
