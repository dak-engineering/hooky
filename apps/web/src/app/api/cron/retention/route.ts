import { createRetentionHandler } from "@/lib/retention-handler";
import { retentionStore } from "@/lib/server-database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const configuredRetentionDays = Number(process.env.RETENTION_DAYS ?? "30");

export const GET = createRetentionHandler({
  cronSecret: process.env.CRON_SECRET,
  retentionDays: Number.isFinite(configuredRetentionDays)
    ? configuredRetentionDays
    : 30,
  deleteEventsReceivedBefore: (input) =>
    retentionStore.deleteEventsReceivedBefore(input),
});
