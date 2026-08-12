import { authenticateApiAccount } from "@/lib/authenticated-account";
import { createHeartbeatHandler } from "@/lib/listener-api";
import { deliveryStore } from "@/lib/server-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const heartbeat = createHeartbeatHandler({
  authenticate: authenticateApiAccount,
  extendDeliveryLease: (input) => deliveryStore.extendDeliveryLease(input),
  now: () => new Date(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ "delivery-id": string }> },
) {
  return heartbeat(request, (await params)["delivery-id"]);
}
