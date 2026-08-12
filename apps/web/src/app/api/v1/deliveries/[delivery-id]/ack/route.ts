import { authenticateApiAccount } from "@/lib/authenticated-account";
import { createAcknowledgeHandler } from "@/lib/listener-api";
import { deliveryStore } from "@/lib/server-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const acknowledge = createAcknowledgeHandler({
  authenticate: authenticateApiAccount,
  acknowledgeDelivery: (input) => deliveryStore.acknowledgeDelivery(input),
  now: () => new Date(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ "delivery-id": string }> },
) {
  return acknowledge(request, (await params)["delivery-id"]);
}
