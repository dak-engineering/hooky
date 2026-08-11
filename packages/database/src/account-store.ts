import type { Pool, PoolClient } from "pg";

export type AccountMembership = {
  accountId: string;
  name: string;
  role: "owner" | "member";
};

async function findMembership(client: Pool | PoolClient, userId: string) {
  const result = await client.query<{
    account_id: string;
    name: string;
    role: "owner" | "member";
  }>(
    `
      select accounts.id as account_id, accounts.name, account_members.role
      from account_members
      inner join accounts on accounts.id = account_members.account_id
      where account_members.user_id = $1
    `,
    [userId],
  );
  const membership = result.rows[0];
  return membership
    ? {
        accountId: membership.account_id,
        name: membership.name,
        role: membership.role,
      }
    : null;
}

export class AccountStore {
  constructor(private readonly pool: Pool) {}

  async findAccountForUser(userId: string) {
    return findMembership(this.pool, userId);
  }

  async ensurePersonalAccount({
    userId,
    name,
  }: {
    userId: string;
    name: string;
  }): Promise<AccountMembership> {
    const client = await this.pool.connect();

    try {
      await client.query("begin");
      await client.query(
        "select pg_advisory_xact_lock(hashtextextended($1, 0))",
        [userId],
      );
      const existing = await findMembership(client, userId);
      if (existing) {
        await client.query("commit");
        return existing;
      }

      const account = await client.query<{ id: string; name: string }>(
        "insert into accounts (name) values ($1) returning id, name",
        [name.trim() || "My workspace"],
      );
      const created = account.rows[0]!;
      await client.query(
        `
          insert into account_members (account_id, user_id, role)
          values ($1, $2, 'owner')
        `,
        [created.id, userId],
      );
      await client.query("commit");

      return { accountId: created.id, name: created.name, role: "owner" };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
