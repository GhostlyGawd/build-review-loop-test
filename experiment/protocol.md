# Preregistered neutral-build versus review-loop protocol

Protocol version: 2.0.0-frozen

Design: paired, blinded pilot with two independent neutral builds, post-build random assignment, and treatment-only iterative review

Primary interpretation: descriptive effect estimate, not statistical inference

## 1. Question and estimands

Question: after two builders independently receive the same frozen React/TypeScript task, does applying one frozen review-loop algorithm to a randomly assigned implementation improve its final blinded rubric score relative to the other implementation, which is frozen after construction?

The three scored snapshots are:

- `B0`: baseline initial/final snapshot; baseline receives zero cycles.
- `T0`: treatment initial snapshot, sealed before any cycle.
- `Tfinal`: treatment snapshot after the stopping rule.

The primary estimand is `score(Tfinal) - score(B0)`. The secondary within-treatment estimand is `score(Tfinal) - score(T0)`. Negative values favor the comparator. For promotion to `main`, select the higher of `B0` and `Tfinal`; an exact tie selects `B0` (baseline).

## 2. Frozen status and lock boundary

Version 2.0.0-frozen has all external commitments recorded in `experiment/lock.json`. The completed lock procedure, performed before any builder sees task materials, MUST:

1. pass `npm ci` and `npm run check` on Node 22;
2. record the exact lock-parent commit;
3. freeze the sealed hidden-suite archive and record its SHA-256 without committing its contents;
4. freeze the treatment skill-v1 source and manifest and record their commit and SHA-256;
5. verify the treatment-loop algorithm against the final skill-v1 source and record its commitment;
6. record SHA-256 hashes of the neutral builder prompt and neutral builder configuration, both of which MUST be delivered byte-for-byte without per-builder substitution;
7. validate all templates and prospective semantic test cases; and
8. confirm no builder has received task materials.

The lock cannot contain its own commit SHA. After the lock is merged, the operator records the final GitHub `commonStartCommit`, preregistration lock commit, and byte-identical lock-file SHA-256 in the private experiment manifest and both run manifests. That triple is the authoritative common-start binding.

After locking, the specification, rubric, public tests, prompts, schemas, validator, initial dependencies, CI, and lock are immutable. A correction follows section 13; it is never repaired silently.

## 3. Experimental units and neutral construction

The units are two isolated worktrees created from the same bound `commonStartCommit`, privately tracked by the operator as `candidate-a` and `candidate-b`. Each receives the exact same bytes of `experiment/prompts/neutral-builder.md` and the exact same serialized builder configuration, with no label/deadline substitution or surrounding coaching. No builder receives, reads, or is told about the treatment skill, review algorithm, assignment, other candidate, hidden suite, or downstream role prompts.

Each builder gets exactly one agent/subagent turn and inherits the same model, provider/version, reasoning setting, tool permissions, starting context, machine class, Node/npm versions, network policy, and prospective limits. The two initial builds may run concurrently in equivalent isolation or sequentially without cross-run context. Their initial commits and evidence chains are sealed before assignment.

## 4. Post-build assignment

Only after both `T0/B0`-eligible initial snapshots and their evidence chains are immutable, the operator obtains exactly 32 bytes from an operating-system CSPRNG. Record the 64-lowercase-hex seed in the private manifest. No redraw is allowed.

The assignment algorithm is fixed and MUST be implemented byte-for-byte:

1. UTF-8 encode and byte-sort the two candidate IDs as `id0` and `id1`;
2. construct `material` as the ASCII/byte domain `build-review-loop-assignment-v2\x00`, the 32 raw seed bytes, `uint64be(len(id0_bytes))`, `id0_bytes`, `uint64be(len(id1_bytes))`, and `id1_bytes`, in that order;
3. compute `digest = SHA-256(material)`;
4. set the baseline index to `digest[0] & 1`; the other index is treatment.

This maps exactly one candidate to each arm without modulo bias. Preserve the seed, digest, draw, mapping, generation command/API, timestamp, and operator identity. Assignment remains private from treatment roles and the evaluator until artifacts are sealed.

## 5. Prospective budgets and role freshness

Every role receives exactly one agent/subagent turn. Token ceilings are unavailable in this execution environment and are therefore `null`, with a required `tokenCeilingUnavailableReason`; provider usage is recorded when exposed and otherwise remains `null`, never estimated. Wall-clock exhaustion seals the current filesystem state without operator repair.

| Role            | Maximum wall time | Applicability                                   |
| --------------- | ----------------: | ----------------------------------------------- |
| Neutral builder |        40 minutes | once per candidate, same inherited model/config |
| Reviewer        |        15 minutes | fresh role, at most once per treatment cycle    |
| Fixer           |        25 minutes | fresh role, at most once per treatment cycle    |
| Tester          |        15 minutes | fresh role, at most once per treatment cycle    |
| Evaluator       |        30 minutes | one fresh blinded role for X/Y/Z                |

Roles MUST NOT be resumed, extended, or given an extra turn. Cost records include wall time, exposed token fields, and provider cost when available. Identical warnings may be issued at 75% and 90% of a budget.

## 6. Frozen treatment-loop algorithm

Baseline is frozen at its initial snapshot and receives exactly zero reviewer, fixer, or tester cycles.

Treatment alone receives up to five cycles. Each cycle uses a fresh reviewer, then (when required) a fresh fixer, then a fresh tester. Roles see only the frozen common artifacts and the inputs explicitly named by their prompt. They receive no earlier transcripts, identities, costs, assignment seed/mapping, baseline material, hidden content, or Git history.

The exact skill-v1 flow is stored in `experiment/treatment-loop-algorithm.md`. It defines, without operator discretion, the cycle inputs, finding handoff, verification behavior, and next-cycle state. These outer rules are fixed:

- at most five complete cycles are recorded, numbered 1 through 5;
- all reviewer findings use the single schema in `experiment/schemas/finding.schema.json` and severities `critical`, `high`, `medium`, or `low`;
- if a cycle reviewer reports zero actionable findings, stop immediately with `zero-findings` and do not invoke that cycle's fixer or tester;
- after cycle 5, stop with `max-cycles` even if findings remain;
- tester runs `npm run check` exactly, records every component gate, does not edit, and does not independently create findings;
- every invoked role produces a schema-valid artifact and evidence-chain link.

## 7. Immutable gates and evidence chains

Public gates are immutable: `docs/permissions-playground-spec.md`, `docs/public-test-contract.md`, `tests/public/**`, `scripts/run-public-tests.mjs`, dependency versions/lockfile, rubric weights and anchors, protocol/prompts/schemas/validator, CI, and the activation file list. Builders and treatment roles may change implementation files, application documentation, and candidate-added tests only.

Every snapshot and role artifact is content-addressed. The run manifest links, in order: common-start triple; neutral prompt/config hashes; initial source commit and tree hash; assignment record hash; each cycle input commit; role prompt hash; transcript hash when available; review/fix/test artifact hashes; output commit/tree hash; exact check commands/exit codes; and cost-record hash. The evaluator chain links each neutral package hash, public/hidden suite hashes, raw test outputs, rubric artifact hash, and evaluator transcript hash when available. Missing provider transcripts are recorded as `null`, not fabricated.

An evidence hash is SHA-256 over the exact artifact bytes. A source-tree hash uses the frozen packaging procedure declared in the manifest. Each link names its predecessor hash, yielding an auditable append-only chain. Any mismatch is an invalidation event.

## 8. Blind X/Y/Z evaluation

After treatment stops, the operator exports exactly three history-free source packages: `B0`, `T0`, and `Tfinal`. Packages exclude `.git`, branches, authorship, manifests, prompts, role artifacts, timestamps, costs, transcripts, and filenames or metadata that disclose stage/lineage. Each includes only the source snapshot and the byte-identical frozen public materials needed to build and score it.

Using a separate recorded 32-byte OS-CSPRNG seed, the operator assigns the three packages without replacement to labels `X`, `Y`, and `Z`. Compute `digestSha256` over UTF-8 `permissions-playground/protocol-v2/evaluation\n` plus the lowercase seed hex. For each of `B0`, `T0`, and `Tfinal`, compute a rank key as SHA-256 over the lowercase digest text, one newline, and that snapshot name. Sort ascending by rank key and map the resulting positions to X, Y, and Z. The evaluator receives only randomized X/Y/Z packages, frozen specification, public tests, sealed hidden suite, and exact rubric. It does not receive the package mapping, assignment, history, arm identity, cycle facts, prompts, or skill.

In one fresh turn (30-minute maximum), the evaluator verifies suite commitments, runs the frozen public and sealed hidden suites in equivalent clean Node 22 environments, inspects the UI as required by the rubric, and emits one evaluation artifact for each of X/Y/Z. It scores the exact 50/15/15/10/10 rubric, applies only its registered caps, and seals all artifacts before unblinding. The operator then reveals the X/Y/Z mapping and computes the primary and secondary deltas and the tie-to-baseline main selection in `experiment/schemas/outcome.schema.json`.

## 9. Finding identity and severity

`experiment/schemas/finding.schema.json` is the only authoritative finding shape. IDs are `cycle-N-reviewer-NN`. One finding describes one reproducible defect or bounded risk, with evidence, expected/actual behavior, rubric IDs, verification, and optional duplicate linkage.

- `critical`: prevents meaningful evaluation, broadly corrupts core policy decisions, or creates material security/privacy exposure.
- `high`: breaks a required workflow or a substantial set of specified outcomes.
- `medium`: localized contract, accessibility, usability, test, or documentation defect with material rubric impact.
- `low`: bounded polish, maintainability, or documentation defect tied to a rubric anchor; non-required preference is not a finding.

The fixer records an accepted, partially accepted, or rejected disposition for every handed-off finding with rationale and evidence. Findings are immutable after their role artifact is sealed.

## 10. Outcomes and arithmetic

The evaluator records observable evidence only. Evaluation item maxima and section maxima remain exactly 50/15/15/10/10. `uncappedTotal` equals the five section totals; `finalTotal` applies only the rubric's registered caps. Protocol validation rejects duplicated/missing rubric IDs, incorrect maxima, subtotal/total arithmetic, undeclared or inapplicable caps, non-bijective X/Y/Z mappings, incorrect deltas, and an incorrect tie winner.

Report:

- primary: `Tfinal - B0`;
- secondary: `Tfinal - T0`;
- all three totals and section totals;
- public and hidden test counts;
- cycle/find/fix/test effectiveness;
- role wall time, exposed token usage, and exposed USD cost; and
- deviations, invalid runs, hashes, and raw rubric artifacts.

Do not combine score and cost into an unregistered composite.

## 11. Invalidation rules

Invalidate one candidate run and rerun it from common start before assignment if construction used the wrong start, prompt bytes, config, inherited model/settings, budget, dependency lock, extra role turn, cross-candidate context, skill exposure, hidden content, operator code edit, or modified public gate. Because assignment occurs only after both initial builds seal, a pre-assignment rerun requires discarding the unused seed (if any) and generating assignment only after two valid replacements exist.

Invalidate treatment from `T0` and repeat assignment-independent treatment processing only when a treatment role receives the wrong frozen algorithm/prompt/input, exceeds five cycles, reuses a role context, exceeds its prospective budget, sees baseline/hidden/assignment material, modifies a public gate, or has a broken evidence link. Preserve the failed attempt as invalid evidence; do not count it as a valid cycle.

Invalidate evaluation and repackage all three snapshots with a new evaluation-label seed if the evaluator learns lineage/arm identity/history, receives a non-history-free package, uses a changed/uncommitted suite, modifies a package, receives extra turns, or produces unverifiable evidence. Scores from that attempt remain sealed and excluded.

Invalidate the entire experiment and restart from a new lock when a substantive frozen common-artifact error is found; hidden-suite contents or answer hints reach a builder or fixer; environment drift makes initial builds materially incomparable; assignment is drawn/redrawn early or selectively; the candidate-to-arm mapping is changed; a result is seen before an outcome/stopping/rubric change; or evidence loss prevents validity audit.

Material platform outages unique to a unit invalidate that unit. Ordinary failure to implement or find/fix defects is an outcome, not invalidation. Preserve every invalid attempt with reason, but do not create invalid-attempt evidence prospectively in this scaffold.

## 12. Stopping and reporting

Construction stops after two valid sealed initial builds and one recorded assignment. Baseline stops at zero cycles. Treatment stops only under the frozen algorithm, `zero-findings`, `max-cycles`, role budget/platform/safety termination, or an invalidation condition. There is no early stop for apparent quality, test pass rate, reviewer sentiment, cost, or remaining time.

If a candidate cannot build for product reasons, score available evidence with rubric zeroes/caps. If three consecutive valid-run attempts fail for the same external platform reason, stop the pilot as blocked and report attempts; do not substitute a different design.

Because `n=1` per arm, do not report p-values, confidence intervals, significance, population-level superiority, or generalize beyond this task/provider configuration. Keep mappings private until all three evaluation artifacts are sealed. Label exploratory observations.

## 13. Amendments

Before builders start, a change requires a new protocol version, rationale, diff, timestamp, operator identity, new lock, and updated common-start binding. After builders start, do not amend in place; apply section 11.
