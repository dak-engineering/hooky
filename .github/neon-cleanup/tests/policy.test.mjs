import { test, expect } from "bun:test";
import { deletionCandidate } from "../cleanup.mjs";

function input() {
  return {
    config: {
      repository: "team/app",
      permanentBranchIds: ["br-main"],
      permanentBranchNames: ["main", "production", "staging", "develop"],
    },
    defaultBranch: "main",
    gitHead: "abc",
    openPulls: [],
    pull: {
      state: "closed",
      closed_at: "2026-10-02T00:00:00Z",
      head: {
        ref: "feature/test",
        sha: "abc",
        repo: { full_name: "team/app" },
      },
      base: { repo: { full_name: "team/app" } },
    },
    branches: [
      {
        id: "br-preview",
        name: "preview/feature/test",
        default: false,
        protected: false,
        created_at: "2026-10-01T00:00:00Z",
      },
    ],
  };
}

test("closed same-repository PR selects only its exact Vercel preview", () => {
  expect(deletionCandidate(input())?.id).toBe("br-preview");
  const data = input();
  data.gitHead = null;
  expect(deletionCandidate(data)?.id).toBe("br-preview");
});

for (const [label, change] of [
  [
    "reopened PR",
    (d) => {
      d.pull.state = "open";
    },
  ],
  [
    "fork PR",
    (d) => {
      d.pull.head.repo.full_name = "fork/app";
    },
  ],
  [
    "different base repository",
    (d) => {
      d.pull.base.repo.full_name = "team/other";
    },
  ],
  [
    "other open PR sharing a ref",
    (d) => {
      d.openPulls = [{ head: { ref: "feature/test" } }];
    },
  ],
  [
    "new commits after closure",
    (d) => {
      d.gitHead = "def";
    },
  ],
  [
    "branch recreated after closure",
    (d) => {
      d.branches[0].created_at = "2026-10-03T00:00:00Z";
    },
  ],
  [
    "invalid creation timestamp",
    (d) => {
      d.branches[0].created_at = "invalid";
    },
  ],
  [
    "default Neon branch",
    (d) => {
      d.branches[0].default = true;
    },
  ],
  [
    "protected Neon branch",
    (d) => {
      d.branches[0].protected = true;
    },
  ],
  [
    "explicit permanent ID",
    (d) => {
      d.config.permanentBranchIds.push("br-preview");
    },
  ],
  [
    "permanent Git branch",
    (d) => {
      d.config.permanentBranchNames.push("feature/test");
    },
  ],
  [
    "GitHub default branch",
    (d) => {
      d.defaultBranch = "feature/test";
    },
  ],
  [
    "parent branch",
    (d) => {
      d.branches.push({ id: "br-child", parent_id: "br-preview" });
    },
  ],
  [
    "unrecognized naming",
    (d) => {
      d.branches[0].name = "feature/test";
    },
  ],
]) {
  test(`keeps ${label}`, () => {
    const data = input();
    change(data);
    expect(deletionCandidate(data)).toBeNull();
  });
}
