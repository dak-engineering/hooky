import { databasePool } from "@/lib/server-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function createHealthHandler({
  checkDatabase,
}: {
  checkDatabase: () => Promise<void>;
}) {
  return async function healthHandler() {
    try {
      await checkDatabase();
      return Response.json(
        { service: "hooky-web", status: "ok" },
        { headers: { "cache-control": "no-store" } },
      );
    } catch {
      return Response.json(
        { service: "hooky-web", status: "unavailable" },
        { status: 503, headers: { "cache-control": "no-store" } },
      );
    }
  };
}

export const GET = createHealthHandler({
  checkDatabase: async () => {
    await databasePool.query("select 1");
  },
});
