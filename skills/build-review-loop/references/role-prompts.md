# Role packets

Fill brackets only from frozen inputs. Give workers only their listed packet. Require schema-version-2 JSON outputs and completion/failure attestations. Apply each role's frozen budget, environment, and model-setting policy.

## Builder (send byte-identically twice)

> Implement [TASK] from common start [COMMIT/TREE] in isolated directory [CANDIDATE_DIR]. Acceptance criteria: [CRITERIA]. Public gates: [PUBLIC_GATES]. Allowed paths: [PATHS]. Safety limits: [LIMITS]. Work independently and perform all implementation and Git actions required for your candidate. Do not inspect or communicate with another candidate. No build-review skill or comparison protocol is available to you. Freeze the result and report candidate ID, builder instance ID, snapshot commit/tree, prompt/config hashes, changed paths, measured token cost or null, and blockers. Do not rank or label the approach.

Hash the exact prompt and configuration bytes before dispatch. Do not add per-builder wrappers, names, hints, or metadata.

## Reviewer (treatment only)

> Review current snapshot [SNAPSHOT] against [TASK], [CRITERIA], and [PUBLIC_GATES]. You are fresh and have no provenance or prior-cycle context. Do not edit, fix, run tests, inspect other snapshots, or infer authorship. Return only independently supported actionable findings using the authoritative schema, or an empty findings array. Report measured token cost or null.

## Fixer (treatment only)

> At current snapshot [SNAPSHOT], address only [CURRENT_FINDINGS] under [TASK], [CRITERIA], [PATHS], and [LIMITS]. You have no prior-cycle or other-candidate context. Make the smallest coherent implementation and Git changes. Do not alter gates. Report addressed IDs, blockers, changed paths, new snapshot commit/tree, and measured token cost or null.

## Public-gate tester (treatment only)

> At [SNAPSHOT], run every frozen public gate exactly: [PUBLIC_GATES]. Do not edit, repair, add tests, inspect other snapshots, or change commands. Record each command, working directory, exit code, output digest, and measured token cost or null.

Run a fresh tester after every fix, including the cycle-5 fix.

## Blind evaluator

> Evaluate three anonymous, history-free packages X, Y, and Z against [TASK] and [CRITERIA]. You may inspect each snapshot and must run every frozen public gate [PUBLIC_GATES] and hidden suite [HIDDEN_SUITES] for each package. Do not edit snapshots or seek identities, assignment, mapping, histories, findings, fixes, costs, or cycle counts. Score each package exactly on functional_correctness/50, code_quality_maintainability/15, test_quality/15, security_safety/10, and requirements_scope/10 with evidence. Return frozen per-package results, totals, and measured token cost or null; do not rank semantic candidates.

## Unblinder

> After blind results freeze, apply sealed [PACKAGE_MAP] without changing scores. Copy totals for baseline_final, treatment_initial, and treatment_final. Compute treatment_final minus baseline as primary_delta and treatment_final minus treatment_initial as secondary_delta.

## Git worker

> Perform only the authorized Git operation in [WORKTREE]. Verify exact paths, ref, scope, and status; report commit/tree/ref and cleanliness. Do not create or merge a PR, tag, release, publish, deploy, or alter remote settings without separate authorization.
