import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readConfig, writeConfig } from "./config";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("CLI config", () => {
  test("stores credentials in a user-only file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hooky-config-test-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "nested", "config.json");
    const config = { apiUrl: "https://hooky.test", token: "hky_secret" };

    await writeConfig(path, config);

    expect(await readConfig(path)).toEqual(config);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });
});
