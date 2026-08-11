import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type HookyConfig = {
  apiUrl: string;
  token: string;
};

export function defaultConfigPath(environment = process.env) {
  return (
    environment.HOOKY_CONFIG_PATH ??
    join(homedir(), ".config", "hooky", "config.json")
  );
}

export async function readConfig(path: string): Promise<HookyConfig | null> {
  try {
    const value = JSON.parse(
      await readFile(path, "utf8"),
    ) as Partial<HookyConfig>;
    return typeof value.apiUrl === "string" && typeof value.token === "string"
      ? { apiUrl: value.apiUrl, token: value.token }
      : null;
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      if (error.code === "ENOENT") {
        return null;
      }
    }
    throw error;
  }
}

export async function writeConfig(path: string, config: HookyConfig) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  await chmod(path, 0o600);
}
