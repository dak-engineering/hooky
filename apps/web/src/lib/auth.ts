import { createDrizzleDatabase, schema } from "@hooky/database";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { database } from "./server-database";
import { resolveDeploymentOrigin } from "./deployment-origin";

const fallbackDevelopmentSecret =
  "hooky-development-only-secret-change-before-deploying";

if (process.env.VERCEL && !process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is required on Vercel");
}

const configuredOrigin = resolveDeploymentOrigin(process.env);

export function createHookyAuth({
  database,
  baseURL,
  secret,
  secureCookies,
}: {
  database: ReturnType<typeof createDrizzleDatabase>;
  baseURL: string | undefined;
  secret: string;
  secureCookies: boolean;
}) {
  return betterAuth({
    appName: "Hooky",
    baseURL,
    secret,
    database: drizzleAdapter(database, {
      provider: "pg",
      schema: {
        user: schema.authUsers,
        session: schema.authSessions,
        account: schema.authAccounts,
        verification: schema.authVerifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
    },
    trustedOrigins: baseURL ? [baseURL] : ["http://localhost:3000"],
    rateLimit: {
      enabled: true,
      window: 60,
      max: 100,
    },
    advanced: {
      cookiePrefix: "hooky",
      useSecureCookies: secureCookies,
      disableCSRFCheck: false,
      disableOriginCheck: false,
    },
    plugins: [nextCookies()],
  });
}

export const auth = createHookyAuth({
  database,
  baseURL: configuredOrigin,
  secret: process.env.BETTER_AUTH_SECRET ?? fallbackDevelopmentSecret,
  secureCookies: process.env.NODE_ENV === "production",
});
