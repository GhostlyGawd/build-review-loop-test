# Isolation and runtime boundary

## Builder boundary

Use the pinned PowerShell 7 host at `C:\Users\rhenm\AppData\Local\pwsh7\pwsh.exe` (version `7.6.2`, SHA-256 `99ec38d8c4910fd5f2feeeec4dedb5076ff39a08ca21e12642822bc8d989e316`) with `-NoProfile -File`. The runner in turn launches the pinned Codex CLI binary at `C:\Users\rhenm\.codex\plugins\.plugin-appserver\codex.exe` (version `codex-cli 0.145.0-alpha.18`, SHA-256 `20d611ef1c9851f4da1cb4609beb6763904f72275cb91517b2400639ca1c28c4`) under attested ChatGPT authentication.

Create two independent full clones at the same bound commit/tree. Disable remotes, require clean status, and keep their canonical paths distinct, nonnested, and free of reparse points. Keep each clone separate from a fresh evidence root. Give every invocation distinct final/stdout/stderr/evidence paths, temp/cache/dependency roots, port, opaque invocation ID, process ID, and thread ID.

Freeze the exact global argv order:

```text
-a never -m gpt-5.4 -c model_reasoning_effort="xhigh" exec
--ephemeral --ignore-user-config --skip-git-repo-check
--sandbox workspace-write --json
```

Append only `-C <workdir> -o <final-path> -`. Write the exact neutral builder prompt bytes to stdin without prefix/suffix/substitution/wrapper, then close stdin. Never resume. The smoke prompt is a separate frozen harmless preflight input and is forbidden for a builder execution.

## Treatment-role boundary

Use one fresh external CLI subprocess for each reviewer, fixer, tester, and evaluator. Never fork or resume a conversation containing another role or cycle.

- Reviewer: independent read-only clone at the bound commit/tree; HEAD/tree/status must remain unchanged.
- Fixer: authorized full-clone workspace-write input; it may create exactly one child commit and must finish clean.
- Tester: disposable workspace-write clone; HEAD/tree/status and package transfer remain unchanged after discarding the copy.
- Evaluator: disposable workspace-write history-free package outside every Git worktree; package content hash must remain unchanged.

Render role prompts only by replacing the exact role-specific token set with bounded single-line literal values. Bind the lock, runner, evidence schema, prompt template, rendered prompt, artifact schema, input commit/tree or package seal, handoff, rubric, and hidden-suite commitment before launch. The runner injects observed runtime identity into the final artifact, validates the authoritative final schema, and writes a separate supervision record.

## Audited procedural claim

This is an audited procedural boundary plus CLI sandbox, not proof of kernel-enforced containment. It cannot prove every child write, network action, junction, reparse escape, credential observation, or model/provider metadata claim was blocked. Compensating evidence includes independent full clones, disabled remotes, clean bound inputs, nonnested non-reparse roots, disposable copies, pre/post hashes, exact argv/prompt hashes, strict raw JSONL reconciliation, and no mutation transfer.

Trusted JSONL may omit model/provider/reasoning metadata. Record a trusted value when observed; otherwise record `null` with a specific absence reason. Agent self-report is not runtime evidence. A conflicting observed value invalidates the invocation.

Invalidate on missing/out-of-scope evidence, inherited history, resume, repeated process/thread/invocation identity, shared mutable roots, unexpected remotes/network, wrong prompt bytes, unauthorized writes, lifecycle failure, timeout, nonzero exit, malformed JSONL, unbound usage, dirty inputs/outputs, or cross-role/cross-candidate access.

Cleanup is separately authorized destructive work. Resolve and verify exact candidate/evidence targets before deletion; never recursively delete a repository root, home directory, unresolved variable, or broad glob.
