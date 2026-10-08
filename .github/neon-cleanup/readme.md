# Neon preview cleanup

Closing or merging a same-repository PR deletes its exact `preview/<git-branch>`
Neon branch. Old Vercel preview URLs then lose their database. Production, staging,
default/protected branches, parent branches, open PRs, and reused Git branches
are excluded. Fork PRs are skipped because branch-name ownership is ambiguous.

The workflow runs trusted default-branch code with read-only `GITHUB_TOKEN` access.
It never checks out PR code or installs application dependencies. `NEON_API_KEY`
is a GitHub Actions secret; `config.json` pins the reviewed project and permanent
branch IDs. API failures fail the workflow before deletion. Each run can delete
at most one branch and verifies deletion afterward.

After merging the workflow into the default branch, use **Actions → Clean up Neon
preview → Run workflow** with a closed PR number and dry-run enabled to review an
old preview. Disable dry-run only after inspecting the result. Previously closed
PRs do not emit new close events. For a reopened PR whose database was deleted,
trigger a new Vercel preview deployment to recreate the database branch.

No scheduled cleanup service is required. Vercel deployment retention remains a
fallback for integrated preview branches. Branches without PRs need native Neon
expiration: **Neon Console → Branches → Update expiration** for an existing branch,
or select **Automatically delete branch after** when creating one. API/CLI branch
creators must explicitly supply `expires_at`/`--expires-at`; there is no global API
default. Do not expire shared, production, or active PR branches by age alone.

Validation is isolated from application dependencies:

```sh
cd .github/neon-cleanup
bun run lint
bun run prettier
bun test
bun run test:e2e
```

Tests use disposable local HTTP servers and never contact live databases.

References: [Neon Vercel cleanup](https://neon.com/docs/guides/vercel-branch-cleanup),
[Neon expiration](https://neon.com/docs/guides/branch-expiration).
