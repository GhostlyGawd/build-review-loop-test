---
name: build-review-loop
description: Run or audit the provisional protocol-v2.4 neutral-build versus treatment-only review-loop pilot with pinned external Codex CLI subprocesses, post-build random assignment, bounded fresh reviewer/fixer/tester roles, canonical evidence, and mapping-blinded B0/T0/Tfinal evaluation. Use when executing, validating, packaging, or diagnosing this exact public experiment without changing its frozen runtime or evaluation design.
---

# Build Review Loop

Treat this as one provisional, descriptive pilot under a pinned deployment. Make no portability, population, provider-wide, statistical, or strong causal claim. Read [artifact-contract.md](references/artifact-contract.md) before constructing contracts and [isolation.md](references/isolation.md) before creating any runtime directories.

## Freeze the public boundary

1. Bind [canonical-contract.json](references/canonical-contract.json) at canonical SHA-256 `541985e02a49b79910282a6e7f26e43fbde3ae500ebfcdf9cef6d031f1a74b49`.
2. Bind byte-exact [neutral-builder.md](references/neutral-builder.md), [runner-smoke.md](references/runner-smoke.md), [builder-config.json](references/builder-config.json), runtime schemas/templates, role prompts/artifact schemas, both PowerShell runners, the blinded mapping/manifest schemas, and the packager. Never substitute the harmless smoke prompt for a builder prompt.
3. Require the frozen PowerShell 7 host and invoke each runner with `-NoProfile -File`. Require the frozen Codex binary, ChatGPT authentication, `gpt-5.4`, `xhigh`, exact argv order, `--ephemeral`, `--ignore-user-config`, and no resume.
4. Keep the root orchestration-only. Every builder, reviewer, fixer, tester, and evaluator is a fresh external CLI subprocess with exact raw prompt bytes on stdin. Do not use in-process collaboration, inherited transcripts, resumed threads, or extra turns for model roles.
5. Freeze one-turn wall maxima: builder 2400s, reviewer 900s, fixer 1500s, tester 900s, evaluator 1800s, unblinder 300s, Git worker 600s. Keep `maxTokens: null` with a reason; record trusted `turn.completed.usage` when exposed.

## Preflight and build

Create two clean, independent, remotes-disabled full clones at the same commit/tree. Keep clones, evidence, temp, cache, dependency, and port coordinates distinct, nonnested, and outside reparse points. Fill a fresh builder runtime contract from [cli-runtime-contract.template.json](references/cli-runtime-contract.template.json), then validate it before any CLI launch.

Use the byte-exact [run-cli-builders.ps1](scripts/run-cli-builders.ps1) through the pinned `pwsh -NoProfile -File` host. The runner must validate its contract/schema/lock/runner/binary/auth/start/path bindings before launch, start both builders concurrently, write exact neutral prompt bytes to stdin, close stdin, enforce the external deadline, and preserve raw JSONL/stdout/stderr/final/evidence. Accept only distinct process and `thread.started` IDs, one `turn.completed`, reconciled hashes, exit zero, and clean committed clones.

Freeze both initial snapshots and evidence before drawing one 32-byte OS-CSPRNG assignment seed. Apply the registered assignment bytes exactly; baseline receives zero treatment cycles.

## Run treatment roles

Read [role-prompts.md](references/role-prompts.md). For every required reviewer, fixer, or tester invocation, fill [role-runtime-contract.template.json](references/role-runtime-contract.template.json), deterministically render the exact frozen role prompt, and use [run-cli-role.ps1](scripts/run-cli-role.ps1) through the pinned host.

- Reviewer: read-only snapshot; fresh current-cycle context; emit exact findings.
- Fixer: authorized isolated full-clone write; receive only current findings; finish with one clean child commit.
- Tester: disposable workspace-write copy; run immutable `npm run check`; transfer no mutations.

Stop before fixer/tester on verified zero findings. Otherwise run fresh fixer then tester. Stop at zero findings or after cycle 5 under the registered semantics. Bind every role artifact to supervisor-observed invocation/process/thread identity; the separate supervision record binds the contract and final hash without a circular self-hash.

## Package and evaluate

After treatment stops, build a schema-valid private mapping for exactly B0, T0, and Tfinal in randomized X/Y/Z order. Bind exact refs, commits, trees, frozen gates, and private provenance markers. Run the byte-identical [package-blinded-snapshots.mjs](scripts/package-blinded-snapshots.mjs) from the frozen protocol checkout, where its schema and Ajv dependency layout is bound, with separate nonnested mapping, sources, output root, and private manifest paths. Treat the bundled copy as the exact source commitment.

The packager must reject traversal, nesting, source/ref/commit/tree drift, non-clean or autocrlf-mutated sources, symlinks, frozen-gate drift, lineage tokens, and reused outputs. Its evaluator-facing package manifests contain only labels and package seals—never source role/ref/commit/tree/path or private provenance.

Launch one fresh evaluator subprocess per single history-free package, in randomized order. Give it only that package plus the frozen rubric/public tests and sealed hidden suite. Record its mapping guess and integer confidence, seal the artifact before launching the next evaluator, and prohibit revisions. Reveal the mapping only after all three evaluator artifacts are sealed.

## Validate and stop safely

Run:

```text
python scripts/validate_artifacts.py tests/fixtures/golden-run.json --mode execution --expect-golden
python scripts/validate_artifacts.py tests/fixtures/invalid-current.json --mode execution
python -m unittest scripts/test_validate_artifacts.py -v
```

Invalidate on any frozen-byte, host, binary, auth, model/reasoning, argv, prompt, runtime, path, process/thread, lifecycle, JSONL, usage, artifact, snapshot, assignment, gate, package, evaluator sequence, seal, or evidence-chain mismatch. Preserve sanitized invalid evidence. Do not silently weaken the design, launch a replacement runtime, publish, push, open a PR, deploy, tag, release, or change repository settings without separate authorization.
