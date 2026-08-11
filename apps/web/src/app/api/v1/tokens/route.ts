import { authenticateAccount } from "@/lib/authenticated-account";
import { apiTokenStore } from "@/lib/server-database";
import { createTokenCollectionHandlers } from "@/lib/tokens-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handlers = createTokenCollectionHandlers({
  authenticate: authenticateAccount,
  createToken: (input) => apiTokenStore.createToken(input),
  listTokens: (input) => apiTokenStore.listTokens(input),
});

export const { GET, POST } = handlers;
