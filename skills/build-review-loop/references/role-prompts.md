# Public protocol-v2 role packets

Fill brackets only from frozen inputs. Give each worker only its packet. Use one turn, its registered wall maximum, the frozen environment/model policy, `maxTokens: null`, and a nonempty unavailability reason. Require public schema field names and canonical evidence.

## Builder (2400 seconds; send byte-identically twice)

Dispatch the entire bundled [neutral-builder.md](neutral-builder.md) without substitution, prefix, suffix, path wrapper, timestamp, or added guidance, together with byte-identical [builder-config.json](builder-config.json). The only per-builder input is its strict opaque assignment envelope at the prompt's direct task-leaf path. Validate prompt/config/schema and common-start bindings before reading repository contents. Listing the coordination directory or reading a sibling assignment invalidates the experiment.

## Reviewer (900 seconds; treatment only)

> Review [SNAPSHOT] against [TASK], [CRITERIA], and frozen public materials. You are fresh and history-free. Do not edit, fix, inspect other snapshots, infer provenance, or receive prior cycles. Return findings only, each with exactly id, severity, title, evidence, expected, actual, rubricItems, verification, duplicateOf. IDs are cycle-[1-5]-reviewer-[0-9]{2}; severities are critical/high/medium/low. Return an empty findings array only when independently verified.

Emit the complete public review artifact: candidateLabel, cycle, snapshotCommit, roleInstanceId, workerId, startedAt, completedAt, checksRun, evidenceExamined, coverageGaps, findings.

## Fixer (1500 seconds; treatment only)

> At [SNAPSHOT], address only [CURRENT_FINDINGS] under frozen scope/safety. You have no other cycle/candidate history. Do not change gates. Emit the public fix artifact with candidateLabel, cycle, roleInstanceId, workerId, startCommit, finalCommit, timestamps, ordered dispositions, changedFiles, checks, remainingDefects, deviations.

## Tester (900 seconds; treatment only)

> At [SNAPSHOT], run immutable `npm run check` without edits or repair. Record the seven ordered component commands/results, overall exit code, rawOutputSha256, timestamps, snapshot/worker/role IDs, and `workingTreeClean: true` in the public test artifact.

Use a fresh tester after every fix, including cycle 5.

## Blind evaluator (1800 seconds)

> Evaluate anonymous history-free X/Y/Z in one fresh turn. Verify frozen commitments; run `npm run test:public` and `node sealed-hidden-suite/run.mjs` for each package in equivalent clean Node 22 environments. Do not seek mapping, assignment, histories, identities, prompts, costs, cycles, or skill. Emit one exact evaluation artifact per label with publicTests, hiddenTests, A1..E4 items in registered order at written anchors/maxima, five sectionTotals, uncappedTotal, capConditions, capsApplied, finalTotal, uncertainties, and hashes. Do not unblind or rank semantic snapshots.

## Unblinder (300 seconds)

> After X/Y/Z artifacts freeze, apply [SEALED_MAPPING] without changing scores. Emit the public outcome: packageMapping, B0/T0/Tfinal scores, Tfinal−B0, Tfinal−T0, tie-to-baseline selection, evaluation hashes, worker IDs, and evidence hash.

## Git worker (600 seconds)

> Perform only [AUTHORIZED_GIT_OPERATION] in [WORKTREE]. Verify exact paths/ref/scope/status and report commit/tree/ref/cleanliness. Do not create/merge a PR, tag, release, publish, deploy, or alter remote settings without separate authorization.
