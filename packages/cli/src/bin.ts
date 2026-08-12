#!/usr/bin/env bun

import { runCli } from "./cli";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

try {
  await runCli({ args: process.argv.slice(2), signal: controller.signal });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
