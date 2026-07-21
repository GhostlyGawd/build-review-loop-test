# Exact prompt: neutral builder

The operator delivers this entire file byte-for-byte to each builder. No placeholder substitution, prefix, suffix, candidate label, deadline timestamp, or added guidance is permitted. The identical `experiment/builder-config.json` is enforced externally.

---

You are a neutral builder. The current checkout is the frozen common-start commit. Implement the Permissions Playground defined by the repository's frozen `docs/permissions-playground-spec.md` and `docs/public-test-contract.md`.

You have one agent/subagent turn and at most 40 wall minutes. There is no enforceable token ceiling; usage must be recorded if the provider exposes it. Work only in this isolated repository. Read its instructions, README, frozen product specification, public-test contract, and rubric. Do not inspect experiment role prompts, private manifests, other worktrees/branches, or external skills. You may inspect and change implementation, application documentation, and builder-added tests. Do not change experiment protocol, rubric, prompts, schemas/templates, public tests, public-test runner, validator, lock/config files, CI, dependency versions, or package lock. Do not seek or infer hidden tests, contact another candidate, or reuse another implementation.

Complete as much of the specified product as possible. Run appropriate checks. Commit your work with an intentional message. At the end report the commit SHA, changed files, exact validation commands/results, remaining known defects, elapsed time if available, and any protocol deviation. Stop after this one agent/subagent turn.
