import type { FetchImplementation } from "./api-client";
import { HookyApiClient } from "./api-client";
import { defaultConfigPath, readConfig, writeConfig } from "./config";
import { listenForDeliveries, selectHook } from "./listener";

const defaultApiUrl = "https://hooky-dak.vercel.app";

const usage = `Hooky — deliver public webhooks to a local endpoint

Usage:
  hooky login --token <token> [--api-url <url>]
  hooky hooks
  hooky listen --to <local-url> [--hook <name-or-id> | --new <name>]

Environment:
  HOOKY_TOKEN         API token (takes precedence over saved config)
  HOOKY_API_URL       Hooky service URL
  HOOKY_CONFIG_PATH   Override the credential file path`;

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

async function credentials({
  environment,
  configPath,
}: {
  environment: Record<string, string | undefined>;
  configPath: string;
}) {
  const saved = await readConfig(configPath);
  const token = environment.HOOKY_TOKEN ?? saved?.token;
  const apiUrl = environment.HOOKY_API_URL ?? saved?.apiUrl ?? defaultApiUrl;
  if (!token) {
    throw new Error("Run `hooky login --token <token>` first");
  }
  return { token, apiUrl };
}

export async function runCli({
  args,
  environment = process.env,
  configPath = defaultConfigPath(environment),
  fetchImplementation = fetch,
  signal = new AbortController().signal,
  writeOutput = (message) => console.log(message),
}: {
  args: string[];
  environment?: Record<string, string | undefined>;
  configPath?: string;
  fetchImplementation?: FetchImplementation;
  signal?: AbortSignal;
  writeOutput?: (message: string) => void;
}) {
  const [command] = args;
  if (!command || command === "help" || command === "--help") {
    writeOutput(usage);
    return;
  }
  if (command === "--version" || command === "version") {
    writeOutput("0.1.0");
    return;
  }

  if (command === "login") {
    const token = option(args, "--token") ?? environment.HOOKY_TOKEN;
    if (!token) {
      throw new Error("login requires --token <token>");
    }
    const apiUrl =
      option(args, "--api-url") ?? environment.HOOKY_API_URL ?? defaultApiUrl;
    const client = new HookyApiClient({
      apiUrl,
      token,
      fetchImplementation,
    });
    await client.listHooks();
    await writeConfig(configPath, { apiUrl, token });
    writeOutput(`Authenticated with ${apiUrl}`);
    return;
  }

  const configured = await credentials({ environment, configPath });
  const client = new HookyApiClient({
    ...configured,
    fetchImplementation,
  });

  if (command === "hooks") {
    const hooks = await client.listHooks();
    if (hooks.length === 0) {
      writeOutput("No hooks yet.");
      return;
    }
    for (const hook of hooks) {
      writeOutput(`${hook.name}\t${hook.hookId}\t${hook.state}`);
    }
    return;
  }

  if (command === "listen") {
    const destination = option(args, "--to");
    if (!destination) {
      throw new Error("listen requires --to <local-url>");
    }
    const parsedDestination = new URL(destination);
    if (!["http:", "https:"].includes(parsedDestination.protocol)) {
      throw new Error("--to must be an HTTP or HTTPS URL");
    }
    const selected = await selectHook({
      selector: option(args, "--hook"),
      createName: option(args, "--new"),
      listHooks: () => client.listHooks(),
      createHook: (name) => client.createHook(name),
    });
    if ("ingressUrl" in selected) {
      writeOutput(`Webhook URL: ${selected.ingressUrl}`);
    }
    writeOutput(`Listening on ${selected.name} → ${parsedDestination}`);
    await listenForDeliveries({
      hookId: selected.hookId,
      destination: parsedDestination.toString(),
      signal,
      client,
      fetchImplementation,
      onResult: (result) =>
        writeOutput(
          result.delivered
            ? `✓ ${result.deliveryId} → ${result.status}`
            : `↻ ${result.deliveryId} → ${result.error}`,
        ),
    });
    return;
  }

  throw new Error(`Unknown command "${command}"\n\n${usage}`);
}
