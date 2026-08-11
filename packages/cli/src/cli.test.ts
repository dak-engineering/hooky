import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCli } from "./cli";
import { readConfig } from "./config";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("CLI", () => {
  test("validates a token before saving login credentials", async () => {
    const directory = await mkdtemp(join(tmpdir(), "hooky-cli-test-"));
    temporaryDirectories.push(directory);
    const configPath = join(directory, "config.json");
    let authorization = "";
    const output: string[] = [];

    await runCli({
      args: [
        "login",
        "--token",
        "hky_secret",
        "--api-url",
        "https://hooky.test",
      ],
      configPath,
      fetchImplementation: async (input, init) => {
        authorization =
          new Request(input, init).headers.get("authorization") ?? "";
        return Response.json({ hooks: [] });
      },
      writeOutput: (message) => output.push(message),
    });

    expect(authorization).toBe("Bearer hky_secret");
    expect(await readConfig(configPath)).toEqual({
      apiUrl: "https://hooky.test",
      token: "hky_secret",
    });
    expect(output).toEqual(["Authenticated with https://hooky.test"]);
  });
});
