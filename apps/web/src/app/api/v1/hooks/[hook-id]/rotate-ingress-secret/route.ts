import { authenticateAccount } from "@/lib/authenticated-account";
import { createRotateIngressSecretHandler } from "@/lib/hooks-api";
import { hookStore } from "@/lib/server-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const rotate = createRotateIngressSecretHandler({
  authenticate: authenticateAccount,
  rotateIngressSecret: (input) => hookStore.rotateIngressSecret(input),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ "hook-id": string }> },
) {
  return rotate(request, (await params)["hook-id"]);
}
