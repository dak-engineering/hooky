import { authenticateApiAccount } from "@/lib/authenticated-account";
import { createRejectHandler } from "@/lib/listener-api";
import { deliveryStore } from "@/lib/server-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const reject = createRejectHandler({
  authenticate: authenticateApiAccount,
  rejectDelivery: (input) => deliveryStore.rejectDelivery(input),
  now: () => new Date(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ "delivery-id": string }> },
) {
  return reject(request, (await params)["delivery-id"]);
}
