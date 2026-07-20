---
name: build-review-loop
description: Run a prospective experimental build/review pilot with two neutral builders, concealed post-freeze baseline/treatment assignment, a frozen zero-cycle baseline, treatment-only review/fix/test cycles, and blind three-snapshot evaluation. Use when testing whether a bounded iterative review loop improves one of two independently built solutions from the same frozen start while preserving auditable isolation and evidence.
---

# Build Review Loop

Treat this as a breaking, experimental protocol with no portability claim. Keep the root orchestration-only. Delegate every implementation, review, fix, test, evaluation, and Git action to bounded workers. Stop before building if fresh agents or isolated filesystems are unavailable.

## Freeze and build

1. Freeze the task, acceptance criteria, allowed paths, public and hidden suites, five-cycle limit, safety limits, role budgets, environment, model-setting policy, common start commit/tree, and artifact directory. Read [isolation.md](references/isolation.md).
2. Have a delegated Git worker create two new isolated filesystems at the same common start. Do not use the root checkout for either candidate.
3. Send byte-identical neutral prompt bytes and configuration bytes to two fresh builders. Do not expose this skill or mention baseline, treatment, comparison strategy, expected approaches, or the other builder.
4. Freeze both initial snapshots and attestations. Only afterward generate a 32-byte CSPRNG seed and use the one assignment algorithm in [artifact-contract.md](references/artifact-contract.md) to map the two opaque candidate IDs directly to `baseline` and `treatment`.

## Preserve the baseline

Freeze the assigned baseline at its initial snapshot. Run no review, fix, test, or cycle worker against it before evaluation. Record `stop_reason: "baseline_frozen"`, zero cycles, and `convergence_verified: null`.

## Improve only the treatment

Use the bounded packets in [role-prompts.md](references/role-prompts.md). For cycles 1 through 5:

1. Start a fresh, history-free reviewer with only the current treatment snapshot and frozen public inputs. Record findings using the single authoritative finding schema.
2. On zero findings, stop immediately with `stop_reason: "zero_findings"` and `convergence_verified: true`. Do not start a fixer or tester.
3. Otherwise start a fresh fixer with only the current snapshot, current-cycle findings, frozen task inputs, and safety bounds. Then start a fresh tester to run every immutable public gate exactly.
4. After a cycle-5 fix and public test, stop with `stop_reason: "max_cycles"` and `convergence_verified: false`. Do not claim convergence without a later fresh zero-findings review, which the five-cycle limit forbids.

## Evaluate blindly

After treatment stops, construct three history-free packages from the baseline final, treatment initial, and treatment final snapshots. Randomize them to `X`, `Y`, and `Z`; seal the mapping, identities, assignment, cycle history, findings, fixes, and costs from a fresh evaluator.

The evaluator may inspect snapshots and must run the frozen public and hidden suites for all three packages. It must score each package on exactly `functional_correctness`/50, `robustness_security`/15, `accessibility_usability`/15, `test_effectiveness`/10, and `maintainability_documentation`/10 as defined in [artifact-contract.md](references/artifact-contract.md). Unblind only after `blind.json` freezes; compute the primary treatment-final minus baseline score and secondary treatment-final minus treatment-initial score without changing evaluator scores.

## Preserve and validate evidence

- Emit append-only chained events using the canonical SHA-256 rule in the artifact contract. Never edit or reorder an emitted event.
- Freeze an enforceable role `max_tokens` as a positive integer. If the platform cannot impose an exact cap, use JSON `null` with a nonempty unavailability reason; never estimate a cap.
- Record provider token telemetry only when measured. Use JSON `null` when unavailable; never estimate it.
- Keep prompt/config hashes, initial attestations, snapshots, worker IDs, assignment, findings, fixes, suite results, scores, and invalidations. Redact secrets and record redactions.
- Have a delegated validator run `python scripts/validate_artifacts.py RUN_DIR`. A nonzero exit invalidates the evidence; it does not establish an outcome.
- Delegate final Git packaging. Do not open or merge a PR, publish, deploy, tag, release, or change repository settings without separate authorization.

## Stop or invalidate

Stop safely for missing authorization, unsafe or destructive work, secrets, unexpected external effects, a dirty or mismatched start, unavailable isolation, or unavailable fresh workers. Invalidate the affected candidate—or the comparison when fairness or blindness is lost—after prompt/config inequality, early assignment, skill exposure to a builder, cross-candidate access, shared mutable state, baseline modification or cycles, changed gates, role reuse, hidden-history leakage, evidence mutation, unverifiable snapshots, or evaluator access to sealed context. Preserve sanitized evidence and do not substitute a winner.
