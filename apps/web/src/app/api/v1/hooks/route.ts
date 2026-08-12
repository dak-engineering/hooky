import { authenticateApiAccount } from "@/lib/authenticated-account";
import { createHooksCollectionHandlers } from "@/lib/hooks-api";
import { hookStore } from "@/lib/server-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const handlers = createHooksCollectionHandlers({
  authenticate: authenticateApiAccount,
  createHook: (input) => hookStore.createHook(input),
  listHooks: (input) => hookStore.listHooks(input),
});

export const { GET, POST } = handlers;
