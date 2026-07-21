# Preregistered neutral-build versus review-loop protocol

Protocol version: 2.4.0-draft (provisional)

Design: paired, blinded pilot with two independent neutral builds, post-build random assignment, and treatment-only iterative review

Primary interpretation: descriptive effect estimate, not statistical inference

## 1. Question and estimands

Question: after two builders independently receive the same frozen React/TypeScript task, does applying one frozen review-loop algorithm to a randomly assigned implementation improve its final blinded rubric score relative to the other implementation, which is frozen after construction?

This two-unit pilot estimates a descriptive difference under this pinned CLI deployment and procedural isolation design. It is not a statistically powered or strong causal estimate and does not generalize to other providers, models, reasoning settings, tasks, or runtimes.

The three scored snapshots are:

- `B0`: baseline initial/final snapshot; baseline receives zero cycles.
- `T0`: treatment initial snapshot, sealed before any cycle.
- `Tfinal`: treatment snapshot after the stopping rule.

The primary estimand is `score(Tfinal) - score(B0)`. The secondary within-treatment estimand is `score(Tfinal) - score(T0)`. Negative values favor the comparator. For promotion to `main`, select the higher of `B0` and `Tfinal`; an exact tie selects `B0` (baseline).

## 2. Canonical contract and frozen lock boundary

This Markdown protocol is the canonical public source. `experiment/canonical-contract.json` is its machine-readable transcription and is content-addressed in `experiment/lock.json`. A mismatch invalidates the scaffold. The 2.4.0 draft supersedes the 2.3.0 lock with a supervised external CLI runtime. It remains provisional until the final runner smoke and treatment-skill commitments are recorded. Before builder exposure, the final lock MUST:

1. pass `npm ci` and `npm run check` on Node 22;
2. record the exact lock-parent commit;
3. freeze the sealed hidden-suite archive and record its SHA-256 without committing its contents;
4. freeze the treatment skill-v1 source and manifest and record their commit and SHA-256;
5. verify the treatment-loop algorithm against the final skill-v1 source and record its commitment;
6. record SHA-256 hashes of the neutral builder prompt and neutral builder configuration, both of which MUST be delivered byte-for-byte without per-builder substitution;
7. freeze the CLI binary path, version, SHA-256, ChatGPT authentication attestation, exact argv order, runtime-contract schema, and concurrent supervisor;
8. validate all templates, negative runtime cases, and prospective semantic test cases; and
9. run the final harmless supervisor smoke, record its three commitments, and confirm no builder has received task materials.

The lock cannot contain its own commit SHA. After the lock is merged, the operator records the final GitHub `commonStartCommit`, preregistration lock commit, and byte-identical lock-file SHA-256 in the private experiment manifest and both run manifests. That triple is the authoritative common-start binding.

After locking, the specification, rubric, public tests, prompts, schemas, validator, initial dependencies, CI, and lock are immutable. A correction follows section 13; it is never repaired silently.

## 3. Experimental units and neutral construction

The private source unit is the bound `commonStartCommit`/tree. Before builder launch, the operator runs the hash-bound `scripts/prepare-builder-input.mjs` against that clean source. Its explicit source-to-destination allowlist emits two byte-identical, one-root-commit neutral product repositories and a private manifest outside both repositories. Source, allowlist, destinations, and manifest may not cross symlink, junction, or reparse-point ancestors; prospective destinations are resolved through their nearest existing physical parent before source/destination/manifest nonnesting is enforced. The manifest binds source commit/tree, allowlist hash, every projected path/byte hash/size, aggregate projection hash, and projected commit/tree. It excludes source Git history, repository README/instructions, `experiment/`, protocol and role material, skills, hidden-suite material, evidence, and lineage markers. Builders receive only the projected repositories; the source common start and private manifest are never model input.

The frozen public-gate-set hash is computed over evaluator-facing destination paths and the exact projected bytes, including `experiment/builder-package.json` under its builder-visible destination `package.json`; it is never computed from the private protocol package manifest.

The steward invokes `pwsh -NoProfile -File scripts/run-cli-builders.ps1 -ContractPath <absolute-contract.json>`. Before creating evidence directories or launching a model, the runner verifies the frozen PowerShell host and projection-policy hashes, validates the private manifest, and hash-binds `scripts/canonicalize-paths.mjs`. That helper applies native realpath canonicalization to existing paths and the nearest existing ancestor of prospective paths. Both builder and role supervisors use its returned physical spellings for every workdir, `.git`, private-input, prompt/handoff/package/rubric/hidden-suite, evidence, temp/cache/dependency, and output equality or nesting decision, closing short-name and equivalent-path aliases while retaining explicit reparse-ancestor rejection. The builder runner proves that every private input and runtime output is separate from both builder workdirs and compares the complete visible filesystem outside root `.git` to the manifest's exact file, directory, byte, and hash set. This rejects ignored and untracked pre-model context as well as tracked drift. The runner also requires identical projected root commit/tree, aggregate content hash, one-commit history, `core.autocrlf=false`, no remotes, and clean tracked state. It separately binds the private source common-start commit/tree without exposing them to builders. Both builders then run concurrently with distinct temp/cache/dependency roots, port, and evidence directory. After each process exits, the supervisor writes a deterministic full visible-filesystem snapshot outside the workdir and binds its SHA-256 in builder evidence; ignored build outputs are preserved in that snapshot without alone invalidating an otherwise clean tracked post-state. The executable, version, binary hash, ChatGPT auth, `--ignore-user-config`, and invariant argv are identical. The exact argv begins `-a never -m gpt-5.4 -c model_reasoning_effort="xhigh" exec --ephemeral --ignore-user-config --skip-git-repo-check --sandbox workspace-write --json`; only `-C <workdir>` and `-o <final-path>` differ, followed by `-`. Normal mode accepts only the frozen neutral builder prompt; `smokeMode: true` accepts only the frozen harmless runner-smoke prompt.

The supervisor first hashes and loads the frozen lock and contract schema, verifies their CLI/runner bindings, then writes the exact raw prompt bytes to stdin and closes it. There is no prefix, suffix, substitution, wrapper, assignment envelope, or task-leaf context. Each run must have a distinct OS process ID and exactly one distinct `thread.started` ID; it may never resume. Success requires start, stdin delivery, one `turn.completed`, valid raw JSONL, reconciled invocation/argv/prompt/stdout hashes, exposed usage or an explicit absence reason, no timeout, exit zero, and a clean committed clone.

The default common deadline is 2400 seconds. On timeout the supervisor kills the process tree, preserves stdout/stderr/final/evidence artifacts, and marks the run invalid. Binary, lock, schema, common-start, argv/config, prompt, path-root, remote, cleanliness, JSONL, hash, usage, process/thread, lifecycle, or exit drift invalidates. The call boundary is accurately described as audited procedural isolation, not a proof that every possible child write, network action, junction, or reparse-point escape was kernel-blocked: the CLI sandbox is defense in depth, while independent full clones, disabled remotes, disposable copies, nonnested non-reparse roots, pre/post hashes, and no mutation transfer define the auditable experimental boundary. Missing or out-of-scope evidence invalidates.

## 4. Post-build assignment

Only after both `T0/B0`-eligible initial snapshots and their evidence chains are immutable, the operator obtains exactly 32 bytes from an operating-system CSPRNG. Record the 64-lowercase-hex seed in the private manifest. No redraw is allowed.

The assignment algorithm is fixed and MUST be implemented byte-for-byte:

1. UTF-8 encode and byte-sort the two candidate IDs as `id0` and `id1`;
2. construct `material` as the ASCII/byte domain `build-review-loop-assignment-v2\x00`, the 32 raw seed bytes, `uint64be(len(id0_bytes))`, `id0_bytes`, `uint64be(len(id1_bytes))`, and `id1_bytes`, in that order;
3. compute `digest = SHA-256(material)`;
4. set the baseline index to `digest[0] & 1`; the other index is treatment.

This maps exactly one candidate to each arm without modulo bias. Preserve the seed, digest, draw, mapping, generation command/API, timestamp, and operator identity. Assignment remains private from treatment roles and the evaluator until artifacts are sealed.

## 5. Prospective budgets and role freshness

Every model-bearing role—builder, adversarial reviewer, fixer, tester, and blinded evaluator—runs through `pwsh -NoProfile -File scripts/run-cli-builders.ps1` or `pwsh -NoProfile -File scripts/run-cli-role.ps1` under the frozen PowerShell-host, lock, schema, and runtime rules. Each runner validates its complete runtime contract against the exact hash-bound JSON Schema before any Codex CLI/model invocation. Each role gets exactly one ephemeral turn, a distinct invocation/process/thread identity, exact role-prompt bytes on stdin, and no resume or inherited transcript. The single-role contract binds the lock, role runner, supervision schema, role prompt template, deterministic substitutions, rendered prompt, handoff where applicable, role artifact schema, input commit/tree, and fresh evidence destinations. JSON is parsed with ISO date strings preserved as strings so byte-exact template substitution is stable under PowerShell 7. Evaluator contracts additionally bind the private blinded-package manifest/schema/packager, label, package-content hash, rubric, and hidden suite. Reviewer inputs are read-only snapshots whose HEAD/tree must remain identical. Fixers use authorized isolated full-clone writes, must finish clean, and bind exactly one child commit to the input. Testers and evaluators use disposable workspace-write copies whose input commit/tree or package hash must remain unchanged. `codex exec` supports `--output-schema`, but the final role schemas require observed process/thread/invocation fields that the model cannot know; passing those schemas would invite fabricated runtime evidence. Until separately frozen pre-injection model-output schemas exist, the role argv therefore omits `--output-schema`. The supervisor injects observed runtime identity after model output and validates the resulting authoritative artifact. The supervision record separately binds the contract and final artifact hashes, avoiding a circular self-hash. Token ceilings are unavailable and remain `null`; `turn.completed.usage` is captured when exposed and otherwise has an explicit absence reason.

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

## 7. Immutable gates, canonical JSON, and evidence chains

Public gates are immutable: `docs/permissions-playground-spec.md`, `docs/public-test-contract.md`, `tests/public/**`, `scripts/run-public-tests.mjs`, dependency versions/lockfile, rubric weights and anchors, protocol/prompts/schemas/validator, CI, and the activation file list. Builders and treatment roles may change implementation files, application documentation, and candidate-added tests only.

Every snapshot and role artifact is content-addressed. The run manifest links, in order: common-start triple; canonical-contract and gate bindings; neutral prompt/config hashes; builder runtime invocation/evidence hashes; initial source commit and tree hash; assignment record hash; each cycle input commit; role prompt hash; fresh process/thread/lifecycle evidence hash for reviewer, fixer, and tester; review/fix/test artifact hashes; output commit/tree hash; exact check commands/exit codes; exposed `turn.completed.usage`; and cost-record hash. Each single-package evaluator artifact binds its own fresh runtime evidence. Missing trusted runtime metadata is recorded as `null` with a reason and never treated as proof of equality.

Canonical JSON `utf8-sorted-json-v1` accepts only null, booleans, safe integers, strings, arrays, and objects. Object keys sort by ascending UTF-8 bytes; arrays preserve order; strings use JSON escaping; and output contains no insignificant whitespace or trailing newline. Artifact SHA-256 input is the ASCII/byte domain `permissions-playground/canonical-json-v1\x00` followed by those canonical JSON bytes. A source-tree hash uses the frozen packaging procedure declared in the manifest.

Evidence sequence begins at 0 and increases by one. The first `previousSha256` is null; every later value equals the immediately preceding entry's `artifactSha256`. Each artifact hash uses the canonical JSON algorithm above. Any mismatch is an invalidation event.

## 8. Blind X/Y/Z evaluation

After treatment stops, the operator exports exactly three history-free source packages: `B0`, `T0`, and `Tfinal`. Packages exclude `.git`, branches, authorship, manifests, prompts, role artifacts, timestamps, costs, transcripts, and filenames or metadata that disclose stage/lineage. Each includes only the source snapshot and the byte-identical frozen public materials needed to build and score it.

Using a separate recorded 32-byte OS-CSPRNG seed, the operator assigns the three packages without replacement to labels `X`, `Y`, and `Z`. Compute `digestSha256` over UTF-8 `permissions-playground/protocol-v2/evaluation\n` plus the lowercase seed hex. For each of `B0`, `T0`, and `Tfinal`, compute a rank key as SHA-256 over the lowercase digest text, one newline, and that snapshot name. Sort ascending by rank key and map the resulting positions to X, Y, and Z. The evaluator receives only randomized X/Y/Z packages, frozen specification, public tests, sealed hidden suite, and exact rubric. It does not receive the package mapping, assignment, history, arm identity, cycle facts, prompts, or skill.

Invoke `node scripts/package-blinded-snapshots.mjs --mapping <private-mapping.json> --output-root <fresh-output-directory> --manifest <private-manifest.json>`. Prepare each source with `git -c core.autocrlf=false clone ...`, keep `core.autocrlf=false`, and verify the clean frozen-gate bytes before export. The private mapping lists exactly X/Y/Z in randomized order and exactly one B0/T0/Tfinal clean full-clone source with its exact ref, Git commit/tree, frozen public-gate-set hash, and private provenance markers: candidate IDs, run IDs, absolute evidence paths, and role-artifact names. The script rejects path traversal, nested sources/outputs/manifests, source drift, non-regular Git tree modes, exact mapped lineage markers, Git metadata anywhere, role/protocol evidence patterns, and a reused output root. It enumerates only regular blobs in the exact bound `HEAD` tree and writes their `git cat-file blob` bytes, so ignored and untracked filesystem content is neither trusted nor copied. It does not reject generic product or dependency vocabulary such as `baseline-browser-mapping`. It strips Git history and normalizes timestamps, then hashes UTF-8-sorted package contents into a private manifest outside the output root. Blinding is mapping blinding, not a claim that lineage is intrinsically unknowable. A fresh evaluator subprocess sees exactly one history-free X, Y, or Z package, finishes its score, then records a mapping guess, integer confidence percentage from 0 through 100, and observable diagnostic evidence. It seals the artifact before the next evaluator launches; revisions are prohibited. Each evaluator verifies suite commitments, runs the frozen public and sealed hidden suites in an equivalent disposable Node 22 copy, and emits one evaluation artifact. Only after all three seals may the operator reveal the mapping and compute the registered deltas.

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

## 10.1 Canonical roles, costs, and gates

The seven role names and maximum wall seconds are exact: `builder` 2400, `reviewer` 900, `fixer` 1500, `tester` 900, `evaluator` 1800, `unblinder` 300, and `git_worker` 600. Each model invocation has one unique worker/invocation/process/thread identity, one turn, and the pinned `gpt-5.4`/`xhigh`/ChatGPT-authenticated OpenAI configuration. A failed support or resolution preflight invalidates; ignorance is never treated as equality. `maxTokens` is null when unavailable; exposed lifecycle usage is recorded.

The tester command is exactly `npm run check`, invoking in order `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run validate:scaffold`, `npm run test:protocol`, `npm run test:public:if-implemented`, and `npm run build`. The evaluator public command is exactly `npm run test:public`. The sealed hidden suite ID is `permissions-playground-sealed-v2`, its command is `node sealed-hidden-suite/run.mjs`, and its SHA-256 commitment is `a6f38c08eff3fd23fca3299f0777adbea4001d3ac3147272511ff9babd98a19b`. Run records bind all of these values and the canonical-contract hash.

Templates are non-executable examples and validate only in explicit `template` mode. `execution` mode rejects a provisional lock, zero hashes/seeds, sentinel or `required-at-run` values, template-equal records, duplicate worker/process/thread/invocation IDs, invalid snapshots, malformed or unreconciled JSONL, unsafe/nested paths, missing usage treatment, and any divergence from this contract.

## 10.2 Executable invalidation state

A completed experiment status is exactly `valid` or `invalid`. A valid experiment has `activeInvalidation: null`, may preserve zero or more structured `invalidAttempts`, and requires sealed evaluation and scored outcome artifacts. An invalid current experiment has a structured active invalidation with ID, scope, code, reason, detection timestamp, evidence SHA-256, and preserved-artifact SHA-256; its evaluation conclusion and scored outcome are null. Invalid attempts preserve only those metadata and content commitments, never candidate contents. A scored outcome is forbidden whenever active invalidation is non-null.

The public validator interface is `node scripts/validate-scaffold.mjs --mode template|execution --input <json-path>`. Template mode is restricted to explicit template files. Execution mode validates the canonical golden aggregate or a canonical invalid-current record and rejects arbitrary status values.

## 11. Invalidation rules

Invalidate one candidate run and rerun it from common start before assignment if construction used the wrong start, prompt bytes, config, inherited model/settings, budget, dependency lock, extra role turn, cross-candidate context, skill exposure, hidden content, operator code edit, modified public gate, coordination-directory listing, or sibling assignment-file access. Because assignment occurs only after both initial builds seal, a pre-assignment rerun requires discarding the unused seed (if any) and generating assignment only after two valid replacements exist.

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
