---
name: build-review-loop
description: Run an experimental, repository-local two-arm build/review/fix loop with isolated delegated workers, fresh blind review cycles, public gates, append-only evidence, and a blind X/Y evaluation. Use when comparing two independently built solutions from one frozen base while preserving procedural isolation and auditable convergence evidence.
---

# Build Review Loop

Treat this as an experimental protocol, not a portable or production-validated method. Keep the root agent orchestration-only: delegate every implementation, review, fix, test, evaluation, and Git operation. If fresh agents or isolated filesystems are unavailable, stop and report the protocol as not run.

## Freeze the run

1. Freeze the task, acceptance criteria, public test commands, allowed paths, base commit, five-cycle limit, safety limits, and artifact directory before building.
2. Read [isolation.md](references/isolation.md) and have delegated workers create two clean, independent filesystems at the same base commit. Never reuse the orchestrator checkout as an arm.
3. Send the same neutral builder prompt and task packet to two fresh builders. Do not suggest approaches, rankings, or expected differences.
4. Require each builder to freeze its candidate and emit an attestation before assignment. Only then generate an unpredictable 32-byte seed and apply the deterministic seed-parity mapping in the artifact contract to the two sorted candidate IDs; do not retain builder identities in reviewer or evaluator packets.

## Run each arm

Use [role-prompts.md](references/role-prompts.md) for bounded packets and [artifact-contract.md](references/artifact-contract.md) for outputs.

For each arm, repeat at most five review cycles:

1. Start a fresh, history-free reviewer. Provide only the frozen task/criteria, current arm snapshot, and public gate definitions. Exclude previous findings, fixes, tests, the other arm, authorship, costs, and assignment provenance.
2. Record only actionable findings that conform to the finding schema. If there are zero findings, set `stop_reason` to `zero_findings` and `convergence_verified` to `true`; do not run a fixer.
3. Otherwise start a fresh, bounded fixer with only the current snapshot, current-cycle findings, task/criteria, allowed paths, and safety limits. Delegate all edits and Git work to that fixer.
4. After the fix, start a fresh tester to run every frozen public gate. Record commands and exact results even when they fail. Do not change gates to make an arm pass.
5. Continue with a new reviewer through cycle 5. If cycle 5 has findings, still run its bounded fix and all public gates, then stop with `stop_reason: max_cycles` and `convergence_verified: false`; do not infer convergence from the final fix.

Run arms independently; parallel execution is allowed only when the isolation contract is satisfied.

## Evaluate blindly

After both arms stop, start a fresh evaluator with anonymized final snapshots labeled only `X` and `Y`, the frozen task/criteria, and final public-gate results. Exclude identities, assignment seed, cycle histories, findings, costs, and orchestrator opinions. Require a rubric-based `X`, `Y`, or `tie` result with evidence. The evaluator must not modify or test either arm.

Delegate final Git packaging to a separate worker. Do not open, merge, publish, deploy, or change remote settings unless the user separately authorizes it.

## Preserve evidence

- Write new evidence as append-only events; never edit or reorder an emitted event. Link each event with the canonical SHA-256 chain defined in the artifact contract.
- Record measured integer token costs when the provider exposes them; otherwise use JSON `null`. Never estimate missing costs.
- Preserve raw command results, snapshot identifiers, worker-instance IDs, prompt hashes, assignment data, findings, fixes, and decisions. Redact secrets before persistence and record the redaction.
- Have a delegated validator run `python scripts/validate_artifacts.py RUN_DIR`; treat a nonzero exit as invalid evidence, not a losing arm.

## Stop or invalidate

Stop safely on missing authorization, secrets, unsafe/destructive work, unexpected external effects, an unclean or mismatched base, unavailable isolation, or unavailable fresh agents. Do not relax a safety boundary to complete the experiment.

Invalidate the affected arm—or the whole comparison when fairness is lost—after cross-arm access, shared mutable state, unequal builder prompts, assignment before both freezes, changed public gates, worker reuse where freshness is required, hidden-history leakage, evidence mutation, unverifiable snapshot identity, or evaluator access to provenance. Preserve the evidence, state the reason, and do not substitute a winner.
