import { z } from "zod";

const createHookInput = z.object({
  name: z.string().trim().min(1).max(80),
});

type Authentication = { accountId: string } | null;
type HookRecord = {
  hookId: string;
  name: string;
  state: "active" | "disabled";
  createdAt: Date;
  updatedAt?: Date;
};

function unauthorized() {
  return Response.json({ error: "Authentication required" }, { status: 401 });
}

function ingressUrl(request: Request, token: string) {
  return new URL(
    `/e/${token}`,
    process.env.BETTER_AUTH_URL ?? request.url,
  ).toString();
}

export function createHooksCollectionHandlers({
  authenticate,
  createHook,
  listHooks,
}: {
  authenticate: (request: Request) => Promise<Authentication>;
  createHook: (input: {
    accountId: string;
    name: string;
  }) => Promise<HookRecord & { ingressToken: string }>;
  listHooks: (input: { accountId: string }) => Promise<HookRecord[]>;
}) {
  return {
    async GET(request: Request) {
      const authentication = await authenticate(request);
      if (!authentication) {
        return unauthorized();
      }

      return Response.json(
        { hooks: await listHooks({ accountId: authentication.accountId }) },
        { headers: { "cache-control": "no-store" } },
      );
    },
    async POST(request: Request) {
      const authentication = await authenticate(request);
      if (!authentication) {
        return unauthorized();
      }

      const input = createHookInput.safeParse(
        await request.json().catch(() => undefined),
      );
      if (!input.success) {
        return Response.json(
          { error: "A hook name between 1 and 80 characters is required" },
          { status: 400 },
        );
      }

      try {
        const { ingressToken, ...hook } = await createHook({
          accountId: authentication.accountId,
          name: input.data.name,
        });
        return Response.json(
          { ...hook, ingressUrl: ingressUrl(request, ingressToken) },
          { status: 201 },
        );
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "23505"
        ) {
          return Response.json(
            { error: "A hook with that name already exists" },
            { status: 409 },
          );
        }
        throw error;
      }
    },
  };
}

export function createRotateIngressSecretHandler({
  authenticate,
  rotateIngressSecret,
}: {
  authenticate: (request: Request) => Promise<Authentication>;
  rotateIngressSecret: (input: {
    accountId: string;
    hookId: string;
  }) => Promise<{ hookId: string; ingressToken: string }>;
}) {
  return async function rotate(request: Request, hookId: string) {
    const authentication = await authenticate(request);
    if (!authentication) {
      return unauthorized();
    }

    try {
      const rotated = await rotateIngressSecret({
        accountId: authentication.accountId,
        hookId,
      });
      return Response.json({
        hookId: rotated.hookId,
        ingressUrl: ingressUrl(request, rotated.ingressToken),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "Hook not found") {
        return Response.json({ error: "Hook not found" }, { status: 404 });
      }
      throw error;
    }
  };
}
