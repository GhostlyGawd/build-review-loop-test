# Preregistered baseline-versus-treatment protocol

Protocol version: 1.0.0-frozen

Design: paired, blinded, two-arm pilot with one independent implementation per arm

Primary interpretation: descriptive effect estimate, not statistical inference

## 1. Question and hypothesis

Question: for the same frozen React/TypeScript task, does access to one frozen build-review-loop skill improve the final implementation after a standardized review-and-fix cycle compared with the baseline prompt alone?

Directional hypothesis: the treatment arm will have a higher final blinded 100-point rubric score. The primary estimand is `treatment final total − baseline final total`. Negative values favor baseline.

## 2. Freeze boundary and prerequisites

Phase 1 is complete only when:

1. this branch passes `npm ci` and `npm run check` on Node 22;
2. its commit is recorded as `commonStartCommit` in `experiment/lock.json`;
3. the external hidden-suite archive is frozen and its SHA-256 is recorded as `hiddenSuiteSha256` without committing its contents;
4. the treatment skill is immutable; its 40-character commit and manifest SHA-256 are recorded as `treatmentSkillCommit` and `treatmentSkillManifestSha256`;
5. all JSON templates validate against their paired schemas; and
6. no builder has received the task materials.

After the freeze commit, specification, rubric, public tests, prompts, schemas, initial dependencies, and CI are locked. Corrections require a logged protocol amendment and normally invalidate both arms for a clean restart.

## 3. Experimental unit and arms

The unit is a repository worktree produced by one builder session from the same `commonStartCommit`. Exactly two units are run:

- **Baseline:** receives the exact baseline builder prompt and repository, with no treatment skill content, summary, or treatment-specific coaching.
- **Treatment:** receives the exact treatment builder prompt, repository, and read access to the skill at exactly `treatmentSkillCommit`. No newer or working-tree skill state is allowed.

The same model/provider/version, reasoning setting, tool permissions, starting context, machine class, Node/npm versions, network policy, and wall-clock/token limits MUST be used for both builders. The order is randomized with one fair recorded coin flip before either build. `randomizationDraw` is 0 for baseline-first and 1 for treatment-first. A human records the mapping in the private operator manifest; reviewers and the final evaluator see only randomly generated labels `candidate-x` and `candidate-y`.

No context, code, diagnosis, or timing information may pass between builders. Runs are sequential if only one identical execution slot exists; otherwise they may run concurrently on equivalent isolated worktrees.

## 4. Fixed workflow and budgets

Each arm follows exactly this sequence:

1. **Build:** one builder session, maximum 90 wall-clock minutes and 120,000 total model tokens. The builder runs checks, commits, and stops.
2. **Snapshot 1:** operator records commit, diff, command results, elapsed time, and cost. No repair is allowed.
3. **Review:** two independent blinded reviewers inspect Snapshot 1. Reviewer F focuses on functional correctness/tests; Reviewer Q focuses on robustness, security, accessibility, usability, and maintainability. Each has 30 minutes and 30,000 tokens. They receive the same exact reviewer prompt with only the focus placeholder changed.
4. **Fix:** a fresh fixer session for that arm receives the frozen repository, its two verbatim reviews in randomized order, and the exact fixer prompt. Maximum 45 minutes and 60,000 tokens. It may implement only review-responsive fixes or necessary regressions discovered while validating them.
5. **Snapshot 2/final:** operator records commit, diff, disposition for every finding, checks, elapsed time, and cost.
6. **Evaluation:** after both final snapshots are ready, the same blinded evaluator scores all four sealed snapshots (build and final for each candidate) in one recorded randomized order using public tests, the external hidden suite, and the frozen rubric. Snapshot labels do not disclose stage or lineage during scoring. The evaluator receives no arm mapping, prompts, skill information, costs, timestamps, or commit authorship. It emits one evaluation artifact per snapshot; the two final-snapshot artifacts determine the primary outcome.

Budget exhaustion ends that role at its current filesystem state. It is not a reason for operator repair. Provider-reported cached and uncached tokens and USD cost are recorded when available; unavailable fields are `null`, never estimated silently.

## 5. Environment and contamination controls

- Create both arm branches directly from `commonStartCommit`; confirm zero diff before the builder prompt.
- Use clean dependency installation from the committed lockfile. Do not upgrade dependencies per arm.
- Remove or equalize unrelated global instructions. Repository instructions apply equally.
- Baseline tools may include ordinary code/search/test tools available to both arms, but must not expose the treatment skill or derivatives.
- Treatment must not receive extra human coaching beyond the frozen prompt and skill.
- Reviewers and evaluator must not inspect Git history, branch names, authors, agent transcripts, cost records, or arm manifests. The operator supplies source snapshots with neutral labels.
- Hidden tests run only after Snapshot 1 is sealed and again at final evaluation if the evaluator needs before/after evidence. Builders and fixers never see hidden source, individual hidden assertions, or failure messages more detailed than the normalized reviewer findings.
- Network requests by the built app are prohibited. Tool network access is held equal across builders and logged.

## 6. Measurements

### Primary outcome

Final total score (0–100) from `experiment/rubric.md`, adjudicated by the blinded evaluator. Report both totals and the signed treatment-minus-baseline difference.

### Secondary outcomes

- Snapshot 1 total and final-minus-initial score change per arm.
- Section scores and treatment-minus-baseline differences.
- Public and hidden test pass counts at both snapshots.
- Review effectiveness: valid unique defects found, weighted severity sum, and hidden defects found by neither reviewer.
- Fix effectiveness: accepted findings resolved without regression divided by accepted findings.
- Efficiency: build, review, fix, and total wall time; tokens; USD cost where provider-reported.
- Test effectiveness rubric score and mutation probes killed, if the frozen hidden suite includes mutations.

Do not combine score and cost into an unregistered composite. Report raw outcomes even if an arm fails to build.

## 7. Review normalization and finding identity

The operator removes only arm-identifying metadata, not substantive text. Findings receive IDs `<candidate>-<reviewer>-NN`. Duplicate findings across the two reviewers are linked by `duplicateOf` but retained. Severity meanings are fixed:

- `critical`: prevents meaningful evaluation, creates material security/privacy exposure, or corrupts core policy decisions broadly;
- `major`: breaks a required workflow or a substantial set of specified outcomes;
- `minor`: localized contract, accessibility, usability, test, or documentation defect;
- `note`: non-required suggestion, scored only if tied to a rubric anchor.

The fixer marks each finding `accepted`, `rejected`, or `partially-accepted` and supplies evidence. Reviewers do not revise findings after seeing the other review or final code.

## 8. Scoring and adjudication

The evaluator scores observable evidence only. Each rubric item uses its written anchors; intermediate points are permitted only where the rubric explicitly states unit increments. A public or hidden test failure caps the corresponding functional item at the highest anchor consistent with observed behavior. A catastrophic default-allow or code-execution/network violation triggers the rubric caps, not an invented penalty.

If evaluator uncertainty changes the total by 3 or more points, a second blinded adjudicator independently scores only the disputed items. Their item scores are averaged and rounded to the nearest whole point, with `.5` rounded up. Otherwise the first score stands. All rationales and evidence references are retained.

Arm identity is revealed only after both final evaluations and the evaluation artifact hash are sealed.

## 9. Invalidation rules

### Invalidate one arm

Invalidate and rerun only the affected arm from the common start when any of these occurs before unblinding:

- wrong starting commit, prompt, model/settings, budget, dependency lockfile, or skill commit;
- baseline exposure to treatment skill content, other-arm work, hidden content, or treatment-specific coaching;
- treatment failure to receive the frozen skill, or receipt of extra non-frozen skill material;
- builder/fixer modification of frozen protocol, spec, rubric, public tests, activation runner, schemas, or prompts;
- operator/human code edits, unregistered extra role turns, material tool outage unique to one arm, or cross-arm contamination;
- loss/corruption of source snapshot, transcript, cost record, or required manifest that prevents audit.

### Invalidate both arms

Invalidate and restart both arms from a new freeze when:

- a substantive ambiguity/error is found in a frozen common artifact;
- hidden-suite contents or answer-specific hints reach either builder/fixer;
- the evaluator or either reviewer learns arm identity before sealing relevant artifacts;
- environment drift makes arms materially incomparable; or
- the operator changes an outcome, rubric weight, stopping rule, or analysis after seeing arm results.

Cosmetic typos that cannot affect interpretation may be amended without invalidation only if logged before either builder starts. After a result is seen, retain the typo and report it as a limitation.

An invalidated run is preserved and labeled invalid; it is never silently replaced. Report its existence and reason, but exclude it from the primary comparison.

## 10. Stopping rules

The experiment stops after exactly one valid build and final snapshot per arm and one sealed blinded evaluation per snapshot. There is no early stopping for apparent superiority, test pass rate, reviewer sentiment, cost, or time remaining.

A role stops at the earliest of: task completion and committed handoff; wall-clock budget; token budget; unrecoverable platform failure; or a safety boundary. Time warnings may be issued identically at 75% and 90% of budget. No role gets extensions.

If an arm cannot produce a build, the evaluator assigns rubric scores from available evidence, including zeroes/caps, rather than triggering a rerun unless an invalidation condition caused the failure. If three consecutive attempts to obtain a valid run fail for the same external platform reason, stop the pilot as blocked and report all attempts; do not substitute a different design.

## 11. Analysis and reporting

Report the preregistered primary and secondary values, invalid runs/deviations, environment versions, hashes, command results, and raw rubric artifacts. Because `n=1` per arm, do not report p-values, confidence intervals, significance, population-level superiority, or generalize beyond this task/provider configuration.

Interpretation order is: validity first, functional score, non-functional sections, review/fix effectiveness, then cost/time tradeoffs. Any exploratory observation must be labeled exploratory. Keep the arm mapping private until the sealed evaluation is complete, then retain it for audit.

## 12. Amendments

Before builders start, a change requires a new protocol version, rationale, diff, timestamp, operator identity, and updated common-start commit. After builders start, do not amend in place: apply the invalidation rules. Finalizing the two pending hashes is completion of the declared freeze metadata, not a substantive amendment, provided no other byte changes.
