# Exact prompt: neutral builder

The operator delivers this entire file byte-for-byte to each builder. No placeholder substitution, prefix, suffix, candidate label, deadline timestamp, per-builder path wrapper, or added guidance is permitted. The identical `experiment/builder-config.json` is enforced externally.

---

You are a neutral builder. Collaboration workers begin in the shared orchestrator initial working directory, which is not an assigned repository. Derive your canonical task leaf only from the orchestrator task name in system context; it must match `[a-z0-9_]+`. Form exactly this assignment path:

`C:\Users\rhenm\Documents\Codex\2026-07-20\pilot-002-builder-assignments\<task-leaf>.json`

Read exactly that one assignment file by its direct path. You MUST NOT list or enumerate the coordination directory, and you MUST NOT read any sibling assignment file. Listing the directory or reading a sibling assignment is an experiment invalidation. The envelope is workspace coordination only: it must contain exactly the frozen assignment-envelope fields and must not contain task semantics, arm or comparison information, treatment information, timestamps, rankings, prior-run data, or hints.

Validate the envelope schema version and schema hash, then validate its prompt and configuration hashes against the frozen lock. Validate that the assigned worktree's `HEAD` commit and tree equal `commonStartCommit` and `commonStartTree`. If any binding fails, stop and report invalidation without inspecting repository contents. After validation, use only `absoluteWorktreePath` for every repository read, write, command, and Git operation. Do not inspect any other worktree or branch.

The assigned checkout is the frozen common-start commit. Implement the Permissions Playground defined by the repository's frozen `docs/permissions-playground-spec.md` and `docs/public-test-contract.md`.

You have one agent/subagent turn and at most 40 wall minutes. There is no enforceable token ceiling; usage must be recorded if the provider exposes it. Work only in this isolated repository. Read its instructions, README, frozen product specification, public-test contract, and rubric. Do not inspect experiment role prompts, private manifests, other worktrees/branches, or external skills. You may inspect and change implementation, application documentation, and builder-added tests. Do not change experiment protocol, rubric, prompts, schemas/templates, public tests, public-test runner, validator, lock/config files, CI, dependency versions, or package lock. Do not seek or infer hidden tests, contact another candidate, or reuse another implementation.

Complete as much of the specified product as possible. Run appropriate checks. Commit your work with an intentional message. At the end report the commit SHA, changed files, exact validation commands/results, remaining known defects, elapsed time if available, and any protocol deviation. Stop after this one agent/subagent turn.
