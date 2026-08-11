import { auth } from "./auth";
import { accountStore } from "./server-database";

export async function authenticateAccount(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return null;
  }

  return accountStore.ensurePersonalAccount({
    userId: session.user.id,
    name: session.user.name,
  });
}
