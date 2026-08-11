import { createIngressHandler } from "@/lib/ingress-handler";
import { deliveryStore, hookStore } from "@/lib/server-database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ingress = createIngressHandler({
  maxBodyBytes: 4_000_000,
  resolveIngressToken: (token) => hookStore.resolveIngressToken(token),
  recordWebhookEvent: (input) => deliveryStore.recordWebhookEvent(input),
});

async function handle(
  request: Request,
  {
    params,
  }: { params: Promise<{ token: string; path?: string[] | undefined }> },
) {
  const { token, path = [] } = await params;
  return ingress(request, { token, path });
}

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
