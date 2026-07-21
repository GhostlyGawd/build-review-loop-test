---
name: build-review-loop
description: Run the prospective public protocol-v2 neutral-build versus treatment-only review experiment with post-freeze assignment, a zero-cycle baseline, bounded fresh review/fix/test cycles, canonical evidence, and blind B0/T0/Tfinal evaluation. Use when testing whether the frozen review loop improves one of two isolated builds while preserving the public canonical contract and auditable blindness.
---

# Build Review Loop

Treat this as an experimental protocol with no portability claim. Keep the root orchestration-only. Delegate every implementation, review, fix, test, evaluation, unblinding, validation, and Git action. Stop before building when fresh workers or isolated filesystems are unavailable.

## Bind the public contract

1. Read [artifact-contract.md](references/artifact-contract.md) and its bundled [canonical-contract.json](references/canonical-contract.json). Require canonical SHA-256 `4b8c4753aca6a83025e72a0a76680bf78895b0e3be94cd64fed8c06c123b1b01`.
2. Freeze the task, common start, preregistration lock, exact [neutral-builder.md](references/neutral-builder.md), exact [builder-config.json](references/builder-config.json), [assignment-envelope.schema.json](references/assignment-envelope.schema.json), environment/model hashes, allowed implementation paths, safety limits, exact gates, hidden-suite commitment, and artifact paths. Read [isolation.md](references/isolation.md).
3. Freeze one-turn wall budgets: builder 2400s, reviewer 900s, fixer 1500s, tester 900s, evaluator 1800s, unblinder 300s, and Git worker 600s. Record `maxTokens: null` with a nonempty unavailability reason; never invent a ceiling or telemetry.
4. Have a delegated Git worker create two non-nested isolated filesystems at the same common start and two separately attested opaque envelopes. Send byte-identical prompt/config bytes to fresh builders: prompt `28f4cae60ff3de6e4ced0aa839f7f2e435fe6bdb1d3d8f2ef48a0309c9f89a39`, config `8185506b5091bb4791da1dd6a4324c90e4fffc7cf3a9c87090022977e542a606`, and schema `a09fc1ea370f37f320804cfa249b3cf6ac2a1ae975ad3edecce8640e2495eb21`, each equal to the lock commitment. The builder may derive its safe task leaf and read exactly that one direct envelope path; it must never list the coordination directory or read a sibling. Do not expose this skill, arm, comparison strategy, or the other candidate.
5. Freeze both initial snapshots and canonical evidence. Only afterward draw exactly 32 OS-CSPRNG bytes once and apply the registered assignment bytes to map one candidate to baseline and the other to treatment.

## Run the registered arms

Freeze the baseline at B0 with no cycle workers. Require `stopReason: "baseline-zero-cycles"`, `cycles: []`, and `convergence: null`.

For treatment cycles 1 through 5, use [role-prompts.md](references/role-prompts.md):

1. Start a fresh, history-free reviewer on the current snapshot. Emit findings with exactly the nine public fields and registered IDs/severities/rubric items.
2. On zero findings, stop before fixer/tester with decision and stop reason `zero-findings` and convergence `true`.
3. Otherwise start a fresh current-findings-only fixer, then a fresh tester that runs immutable `npm run check` and its seven registered component gates.
4. After a cycle-5 fix/test, stop with `max-cycles` and convergence `false`; do not infer convergence.

## Evaluate and unblind

Export exactly three history-free packages: B0, T0, and Tfinal. With a separate one-time 32-byte OS-CSPRNG seed, apply the registered rank-hash bytes to label them X/Y/Z. Seal mapping, assignment, histories, identities, prompts, costs, and the skill from the fresh evaluator.

In one fresh evaluator turn, verify commitments; run `npm run test:public` and `node sealed-hidden-suite/run.mjs` for every package; and emit three exact public evaluation artifacts. Score all 20 registered items at written anchors, calculate the five section totals, and apply only registered caps. After all three artifacts freeze, delegate unblinding to compute Tfinal−B0, Tfinal−T0, and the tie-to-baseline selection.

## Chain and validate evidence

- Canonicalize with `utf8-sorted-json-v1`: domain-separated SHA-256, UTF-8 byte-sorted object keys, order-preserving arrays, safe integers, JSON string escaping, and no whitespace or trailing newline.
- Start evidence sequence at 0 with `previousSha256: null`; each later predecessor equals the prior `artifactSha256`. Never mutate emitted evidence.
- Keep immutable gate/hidden commitments, raw output hashes, prompt/config hashes, snapshots, artifacts, worker IDs, costs, and invalidations. Record unavailable transcripts and telemetry as JSON `null`, never estimates.
- A completed run has only `status: "valid"` or `status: "invalid"`. A valid run requires `activeInvalidation: null`, exactly three evaluations, and a scored outcome; preserved `invalidAttempts` remain allowed and validated. An invalid run requires structured `activeInvalidation` evidence and null evaluations/outcome. Never attach a score to an active invalidation.
- Have a delegated validator run `python scripts/validate_artifacts.py RUN.json --mode execution`. Validate a steward pair with `python scripts/validate_artifacts.py FIRST.json --mode envelope --second SECOND.json`. Use `--expect-golden` only for the bundled conformance fixture. Template mode is non-executable; execution and envelope modes reject zero hashes/seeds and sentinel/provisional values.
- Delegate final Git packaging. Do not open/merge a PR, publish, deploy, tag, release, or change repository settings without separate authorization.

Stop safely and invalidate on prompt/config/schema inequality, malformed or mismatched envelopes, listing the coordination directory, reading a sibling assignment, unsafe/nested paths, early assignment, redraw, skill exposure, cross-candidate access, shared mutable state, baseline cycles, changed gates/commitments/rubric, role reuse, history leakage, budget overrun, evidence mismatch, sentinel execution data, unverifiable snapshots, or evaluator access to sealed context. Preserve sanitized evidence and do not substitute an outcome.
