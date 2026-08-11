import { auth } from "./auth";
import { accountStore, apiTokenStore } from "./server-database";

function hasTrustedOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    return true;
  }
  return request.headers.get("origin") === new URL(request.url).origin;
}

export async function authenticateAccount(request: Request) {
  if (!hasTrustedOrigin(request)) {
    return null;
  }
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return null;
  }

  return accountStore.ensurePersonalAccount({
    userId: session.user.id,
    name: session.user.name,
  });
}

export async function authenticateApiAccount(request: Request) {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer ")) {
    return apiTokenStore.authenticateToken(authorization.slice(7));
  }
  return authenticateAccount(request);
}
