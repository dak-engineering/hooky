import { z } from "zod";

const tokenInput = z.object({
  name: z.string().trim().min(1).max(80),
});

type Authentication = { accountId: string } | null;
type TokenMetadata = {
  tokenId: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

function unauthorized() {
  return Response.json({ error: "Authentication required" }, { status: 401 });
}

export function createTokenCollectionHandlers({
  authenticate,
  createToken,
  listTokens,
}: {
  authenticate: (request: Request) => Promise<Authentication>;
  createToken: (input: { accountId: string; name: string }) => Promise<{
    tokenId: string;
    name: string;
    prefix: string;
    token: string;
    createdAt: Date;
  }>;
  listTokens: (input: { accountId: string }) => Promise<TokenMetadata[]>;
}) {
  return {
    async GET(request: Request) {
      const authentication = await authenticate(request);
      if (!authentication) {
        return unauthorized();
      }
      return Response.json({
        tokens: await listTokens({ accountId: authentication.accountId }),
      });
    },
    async POST(request: Request) {
      const authentication = await authenticate(request);
      if (!authentication) {
        return unauthorized();
      }
      const input = tokenInput.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!input.success) {
        return Response.json(
          { error: "A token name between 1 and 80 characters is required" },
          { status: 400 },
        );
      }
      return Response.json(
        await createToken({
          accountId: authentication.accountId,
          name: input.data.name,
        }),
        { status: 201 },
      );
    },
  };
}

export function createTokenRevocationHandler({
  authenticate,
  revokeToken,
}: {
  authenticate: (request: Request) => Promise<Authentication>;
  revokeToken: (input: {
    accountId: string;
    tokenId: string;
  }) => Promise<boolean>;
}) {
  return async function revoke(request: Request, tokenId: string) {
    const authentication = await authenticate(request);
    if (!authentication) {
      return unauthorized();
    }
    const revoked = await revokeToken({
      accountId: authentication.accountId,
      tokenId,
    });
    return Response.json({ revoked }, { status: revoked ? 200 : 404 });
  };
}
