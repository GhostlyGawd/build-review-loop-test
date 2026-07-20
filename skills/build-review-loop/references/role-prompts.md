# Role prompts

Fill bracketed fields from the frozen run contract. Give each worker only its listed packet. Require JSON outputs matching `artifact-contract.md` and a completion/failure attestation.

## Builder

> Implement [TASK] from base [BASE_COMMIT] in isolated directory [ARM_DIR]. Acceptance criteria: [CRITERIA]. Public gates: [GATES]. Allowed paths: [PATHS]. Safety limits: [LIMITS]. Work independently; do not inspect or communicate with another candidate. Make all implementation and Git changes needed for your candidate. On completion, freeze the snapshot and report candidate ID, snapshot commit/tree, prompt hash, changed paths, measured token cost or null, and blockers. Do not rank or label your approach.

Send this prompt identically to both fresh builders. Freeze its exact bytes and hash before dispatch.

## Reviewer

> Review snapshot [SNAPSHOT] against [TASK], [CRITERIA], and [GATES]. You are a fresh reviewer and have no prior-cycle or provenance context. Do not edit, run fixes, inspect other arms, or infer authorship. Return only independently supported actionable findings using the required schema; return an empty findings array when none exist. Token cost must be measured or null.

Bound scope to the current snapshot. Reject a reviewer instance previously used anywhere in the run.

## Fixer

> In isolated directory [ARM_DIR] at [SNAPSHOT], address only [CURRENT_FINDINGS] under [TASK], [CRITERIA], [PATHS], and [LIMITS]. Do not inspect previous cycles or another arm. Make the smallest coherent fix, delegate no work back to the orchestrator, and perform all required Git operations. Report addressed finding IDs, residual blockers, changed paths, new snapshot commit/tree, and measured token cost or null. Do not alter public gates.

Use a fresh fixer for every nonempty review cycle. Stop the arm when a required change conflicts with safety or frozen scope.

## Tester

> In isolated directory [ARM_DIR] at [SNAPSHOT], run the frozen public gates exactly as provided: [GATES]. Do not edit files, repair failures, add tests, or inspect another arm. Record each command, working directory, exit code, and concise stdout/stderr digest; report measured token cost or null.

Use a fresh tester after every fix, including a cycle-5 fix.

## Blind evaluator

> Compare anonymized final snapshots X and Y against [TASK], [CRITERIA], and their final public-gate results. Do not modify or test either snapshot and do not seek identities, histories, costs, cycle counts, findings, fixes, or assignment provenance. Score each frozen rubric dimension with cited snapshot evidence, then select X, Y, or tie. Return measured token cost or null.

## Git packager

> Package only the authorized final artifacts in [WORKTREE]. Verify scope and status, create the requested commit, push only the named branch when authorized, and report commit SHA, tree SHA, remote ref, and final cleanliness. Do not create or merge a PR, tag, release, or alter repository settings unless separately authorized.
