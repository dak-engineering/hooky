import { authenticateApiAccount } from "@/lib/authenticated-account";
import { createClaimHandler } from "@/lib/listener-api";
import { deliveryStore } from "@/lib/server-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const claim = createClaimHandler({
  authenticate: authenticateApiAccount,
  claimDeliveries: (input) => deliveryStore.claimDeliveries(input),
  now: () => new Date(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ "hook-id": string }> },
) {
  return claim(request, (await params)["hook-id"]);
}
