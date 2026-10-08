import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { cleanup } from "./cleanup.mjs";

const config = JSON.parse(
  await readFile(new URL("./config.json", import.meta.url), "utf8"),
);
const {
  GITHUB_EVENT_NAME,
  GITHUB_EVENT_PATH,
  GITHUB_REPOSITORY,
  GITHUB_TOKEN,
  NEON_API_KEY,
} = process.env;
assert(
  ["pull_request_target", "workflow_dispatch"].includes(GITHUB_EVENT_NAME),
  "Unsupported workflow event",
);
const event = JSON.parse(await readFile(GITHUB_EVENT_PATH, "utf8"));
if (GITHUB_EVENT_NAME === "pull_request_target")
  assert(event.action === "closed", "Expected a PR-close event");
const result = await cleanup({
  config,
  repository: GITHUB_REPOSITORY,
  pullNumber: Number(
    GITHUB_EVENT_NAME === "pull_request_target"
      ? event.number
      : event.inputs?.pr_number,
  ),
  dryRun:
    GITHUB_EVENT_NAME === "workflow_dispatch"
      ? event.inputs?.dry_run !== "false"
      : false,
  neonKey: NEON_API_KEY,
  githubToken: GITHUB_TOKEN,
});
console.log(JSON.stringify(result));
