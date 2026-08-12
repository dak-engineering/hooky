const modesRequiringExplicitVerification = new Set([
  "prefer",
  "require",
  "verify-ca",
]);

export function normalizePostgresConnectionString(connectionString: string) {
  const url = new URL(connectionString);
  const sslMode = url.searchParams.get("sslmode");

  if (sslMode && modesRequiringExplicitVerification.has(sslMode)) {
    url.searchParams.set("sslmode", "verify-full");
  }

  return url.toString();
}
