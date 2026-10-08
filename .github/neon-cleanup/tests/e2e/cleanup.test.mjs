import { test, expect } from "bun:test";
import { cleanup } from "../../cleanup.mjs";

async function scenario(options = {}) {
  let deleted = false;
  let pullReads = 0;
  const writes = [];
  const seen = [];
  const main = {
    id: "br-main",
    project_id: "project-1",
    name: "main",
    default: true,
    protected: false,
    created_at: "2026-01-01T00:00:00Z",
  };
  const branch = {
    id: "br-preview",
    project_id: "project-1",
    name: "preview/feature/test",
    default: false,
    protected: false,
    parent_id: "br-main",
    created_at: "2026-10-01T00:00:00Z",
  };
  const pull = {
    number: 42,
    state: "closed",
    closed_at: "2026-10-02T00:00:00Z",
    head: { ref: "feature/test", sha: "abc", repo: { full_name: "team/app" } },
    base: { repo: { full_name: "team/app" } },
  };
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      seen.push(url.pathname + url.search);
      if (request.method !== "GET")
        writes.push(request.method + " " + url.pathname);
      if (url.pathname.startsWith("/repos/")) {
        if (request.headers.get("authorization") !== "Bearer github-test")
          return new Response(null, { status: 401 });
        if (options.githubFailure) return new Response(null, { status: 503 });
        if (url.pathname === "/repos/team/app")
          return Response.json({
            full_name: "team/app",
            default_branch: "main",
          });
        if (url.pathname.endsWith("/pulls/42")) {
          pullReads++;
          return Response.json({
            ...pull,
            state: options.reopen && pullReads > 1 ? "open" : "closed",
          });
        }
        if (url.pathname.endsWith("/pulls")) {
          const page = url.searchParams.get("page");
          if (options.lateOpen && page === "1")
            return Response.json(
              Array.from({ length: 100 }, () => ({
                state: "open",
                head: { ref: "other" },
              })),
            );
          return Response.json(
            options.lateOpen
              ? [{ state: "open", head: { ref: "feature/test" } }]
              : [],
          );
        }
        if (url.pathname.includes("/git/ref/heads/"))
          return Response.json({ object: { sha: "abc" } });
      }
      if (request.headers.get("authorization") !== "Bearer neon-test")
        return new Response(null, { status: 401 });
      if (url.pathname.endsWith("/branches")) {
        if (url.searchParams.get("sort_order") !== "asc")
          return new Response(null, { status: 400 });
        if (!url.searchParams.has("cursor"))
          return Response.json({
            branches: [main],
            pagination: options.badPagination
              ? { cursor: "next" }
              : { next: "next" },
          });
        if (options.neonFailure) return new Response(null, { status: 503 });
        const branches = deleted ? [] : [branch];
        if (options.newChild && pullReads > 1)
          branches.push({
            ...branch,
            id: "br-child",
            name: "child",
            parent_id: "br-preview",
          });
        return Response.json({ branches, pagination: {} });
      }
      if (url.pathname.endsWith("/branches/br-preview")) {
        if (request.method === "DELETE") {
          deleted = !options.unconfirmed;
          return Response.json({ branch });
        }
        return deleted
          ? new Response(null, { status: 404 })
          : Response.json({ branch });
      }
      return new Response(null, { status: 404 });
    },
  });
  try {
    const result = await cleanup({
      config: {
        repository: "team/app",
        projectId: "project-1",
        permanentBranchIds: ["br-main"],
        permanentBranchNames: ["main", "production", "staging"],
      },
      repository: "team/app",
      pullNumber: 42,
      dryRun: options.dryRun ?? false,
      neonKey: "neon-test",
      githubToken: "github-test",
      neonBase: server.url.origin,
      githubBase: server.url.origin,
    });
    return { result, writes, seen };
  } catch (error) {
    return { error: error.message, writes, seen };
  } finally {
    await server.stop(true);
  }
}

test("real HTTP cleanup reads every page, deletes exactly one preview, verifies absence", async () => {
  const outcome = await scenario();
  expect(outcome.result).toEqual({
    action: "deleted",
    branchId: "br-preview",
    branchName: "preview/feature/test",
  });
  expect(outcome.writes).toEqual([
    "DELETE /projects/project-1/branches/br-preview",
  ]);
  expect(outcome.seen.at(-1)).toBe("/projects/project-1/branches/br-preview");
});
test("dry-run inventories live APIs without mutation", async () => {
  const outcome = await scenario({ dryRun: true });
  expect(outcome.result.action).toBe("would-delete");
  expect(outcome.writes).toEqual([]);
});
for (const option of [
  "githubFailure",
  "neonFailure",
  "badPagination",
  "reopen",
  "newChild",
]) {
  test(`${option} prevents all writes`, async () => {
    const outcome = await scenario({ [option]: true });
    expect(outcome.error).toBeTruthy();
    expect(outcome.writes).toEqual([]);
  });
}
test("an open PR on a later GitHub page protects its branch", async () => {
  const outcome = await scenario({ lateOpen: true });
  expect(outcome.result.action).toBe("keep");
  expect(outcome.writes).toEqual([]);
});
test("unconfirmed delete fails instead of reporting success", async () => {
  const outcome = await scenario({ unconfirmed: true });
  expect(outcome.error).toContain("did not confirm");
});
