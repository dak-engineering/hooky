import { authenticateAccount } from "@/lib/authenticated-account";
import { apiTokenStore } from "@/lib/server-database";
import { createTokenRevocationHandler } from "@/lib/tokens-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const revoke = createTokenRevocationHandler({
  authenticate: authenticateAccount,
  revokeToken: (input) => apiTokenStore.revokeToken(input),
});

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ "token-id": string }> },
) {
  return revoke(request, (await params)["token-id"]);
}
