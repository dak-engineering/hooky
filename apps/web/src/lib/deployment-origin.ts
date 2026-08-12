export function resolveDeploymentOrigin(
  environment: Record<string, string | undefined>,
) {
  const configuredOrigin = environment.BETTER_AUTH_URL?.trim();
  if (configuredOrigin) {
    return configuredOrigin;
  }

  const vercelUrl = environment.VERCEL_URL?.trim();
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return "http://localhost:3000";
}
