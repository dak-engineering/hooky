import assert from "node:assert/strict";

// Only an exact Vercel preview branch owned by a closed, same-repository PR qualifies.
export function deletionCandidate({
  config,
  pull,
  openPulls,
  branches,
  gitHead,
  defaultBranch,
}) {
  if (
    pull.state !== "closed" ||
    !pull.closed_at ||
    pull.head.repo?.full_name !== config.repository ||
    pull.base.repo.full_name !== config.repository
  )
    return null;
  const ref = pull.head.ref;
  if ([defaultBranch, ...config.permanentBranchNames].includes(ref))
    return null;
  if (openPulls.some((p) => p.head.ref === ref)) return null;
  if (gitHead !== null && gitHead !== pull.head.sha) return null;
  const matching = branches.filter((b) => b.name === `preview/${ref}`);
  assert(matching.length <= 1, "Ambiguous Neon branch name");
  const branch = matching[0];
  if (
    !branch ||
    branch.default ||
    branch.protected ||
    config.permanentBranchIds.includes(branch.id)
  )
    return null;
  if (branches.some((b) => b.parent_id === branch.id)) return null;
  const created = Date.parse(branch.created_at);
  const closed = Date.parse(pull.closed_at);
  if (!Number.isFinite(created) || !Number.isFinite(closed) || created > closed)
    return null;
  return branch;
}

export async function cleanup({
  config,
  repository,
  pullNumber,
  dryRun = true,
  neonKey,
  githubToken,
  neonBase = "https://console.neon.tech/api/v2",
  githubBase = "https://api.github.com",
}) {
  assert(
    repository === config.repository,
    "Repository does not match the reviewed database mapping",
  );
  assert(
    Number.isSafeInteger(pullNumber) && pullNumber > 0,
    "Expected a positive PR number",
  );
  assert(typeof dryRun === "boolean", "Expected a boolean dry-run flag");
  assert(neonKey && githubToken, "Missing NEON_API_KEY or GITHUB_TOKEN");
  assert(
    config.permanentBranchIds.length > 0,
    "Missing permanent branch safeguards",
  );
  async function request(
    base,
    path,
    token,
    method = "GET",
    allowMissing = false,
  ) {
    const response = await fetch(`${base}${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "neon-pr-cleanup",
      },
    });
    if (allowMissing && response.status === 404) return null;
    assert(response.ok, `${method} ${path}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  }
  const repoPath = `/repos/${config.repository}`;
  const neonPath = `/projects/${encodeURIComponent(config.projectId)}/branches`;
  const gh = (path, missing = false) =>
    request(githubBase, `${repoPath}${path}`, githubToken, "GET", missing);
  const repo = await gh("");
  assert(
    repo.full_name === config.repository &&
      typeof repo.default_branch === "string",
    "Unexpected GitHub repository",
  );
  async function inventory() {
    const branches = [];
    let cursor;
    const seen = new Set();
    do {
      const query = new URLSearchParams({
        limit: "100",
        sort_by: "created_at",
        sort_order: "asc",
      });
      if (cursor) query.set("cursor", cursor);
      const page = await request(neonBase, `${neonPath}?${query}`, neonKey);
      assert(
        Array.isArray(page.branches) &&
          page.pagination &&
          Object.keys(page.pagination).every((key) =>
            ["next", "sort_by", "sort_order"].includes(key),
          ),
        "Incomplete Neon pagination",
      );
      for (const branch of page.branches) {
        assert(
          branch.project_id === config.projectId &&
            typeof branch.id === "string" &&
            typeof branch.name === "string" &&
            typeof branch.default === "boolean" &&
            typeof branch.protected === "boolean",
          "Invalid Neon branch",
        );
        branches.push(branch);
      }
      cursor = page.pagination.next;
      assert(
        cursor == null ||
          (typeof cursor === "string" &&
            cursor.length > 0 &&
            !seen.has(cursor)),
        "Invalid Neon pagination cursor",
      );
      if (cursor) seen.add(cursor);
      assert(seen.size < 1000, "Neon pagination limit exceeded");
    } while (cursor);
    assert(
      new Set(branches.map((b) => b.id)).size === branches.length,
      "Duplicate branch inventory",
    );
    assert(
      branches.some(
        (b) => b.default && config.permanentBranchIds.includes(b.id),
      ),
      "Default branch changed; review permanent IDs",
    );
    return branches;
  }
  async function candidate() {
    const pull = await gh(`/pulls/${pullNumber}`);
    assert(
      pull.number === pullNumber &&
        typeof pull.head?.ref === "string" &&
        typeof pull.head?.sha === "string",
      "Invalid PR response",
    );
    const openPulls = [];
    for (let page = 1; ; page++) {
      assert(page <= 1000, "GitHub pagination limit exceeded");
      const batch = await gh(`/pulls?state=open&per_page=100&page=${page}`);
      assert(
        Array.isArray(batch) &&
          batch.every(
            (p) => p.state === "open" && typeof p.head?.ref === "string",
          ),
        "Invalid open PR response",
      );
      openPulls.push(...batch);
      if (batch.length < 100) break;
    }
    const ref = await gh(
      `/git/ref/heads/${encodeURIComponent(pull.head.ref)}`,
      true,
    );
    assert(
      ref === null || typeof ref.object?.sha === "string",
      "Invalid Git ref response",
    );
    return deletionCandidate({
      config,
      pull,
      openPulls,
      branches: await inventory(),
      gitHead: ref?.object.sha ?? null,
      defaultBranch: repo.default_branch,
    });
  }
  const branch = await candidate();
  if (!branch)
    return {
      action: "keep",
      reason: "No branch qualifies for safe PR cleanup",
    };
  if (dryRun)
    return {
      action: "would-delete",
      branchId: branch.id,
      branchName: branch.name,
    };
  // Re-check live PR/ref and the complete branch inventory immediately before deletion.
  const current = await candidate();
  assert(
    current?.id === branch.id && current.created_at === branch.created_at,
    "Branch or PR safety state changed before deletion",
  );
  await request(
    neonBase,
    `${neonPath}/${encodeURIComponent(branch.id)}`,
    neonKey,
    "DELETE",
  );
  const remaining = await request(
    neonBase,
    `${neonPath}/${encodeURIComponent(branch.id)}`,
    neonKey,
    "GET",
    true,
  );
  assert(remaining === null, "Neon did not confirm branch deletion");
  return { action: "deleted", branchId: branch.id, branchName: branch.name };
}
