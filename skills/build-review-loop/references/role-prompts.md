# Frozen role prompt routing

Use the byte-exact bundled prompt templates. Replace only their declared `{{UPPERCASE_TOKEN}}` values with bounded single-line literals, hash the rendered bytes, and place those exact bytes on stdin. Do not add wrappers, history, guidance, or runtime overrides.

For every model role, strict-parse `WALL_CLOCK_DEADLINE_ISO` as UTC. Start the monotonic budget before evidence creation, charge all pre-launch scheduling time, bind `completedAt` to actual OS exit, and reserve the two-second tolerance only for `completionObservedAt` or process-tree termination.

## Builder

Use [neutral-builder.md](neutral-builder.md) twice without substitution, each against one byte-identical source-history-free neutral projection. Source history and the private projection manifest are never model context. Use [runner-smoke.md](runner-smoke.md) only for harmless smoke mode. Builder runtime: concurrent fresh external CLI subprocesses, 2400 seconds maximum, workspace-write projections, `gpt-5.4`/`xhigh`.

## Reviewer

Use [blinded-reviewer.md](blinded-reviewer.md). Exact substitutions: `CANDIDATE_LABEL`, `CYCLE_NUMBER`, `SNAPSHOT_COMMIT`, `WALL_CLOCK_DEADLINE_ISO`. Give only the current read-only treatment snapshot and frozen public inputs. Maximum 900 seconds.

## Fixer

Use [fixer.md](fixer.md). Exact substitutions: reviewer tokens plus `FINDINGS_PATH`. Bind that path and hash to the current sealed review artifact. Give no prior-cycle or baseline history. Maximum 1500 seconds. The model edits the worktree only; the trusted supervisor validates the change, creates exactly one clean hook-free child commit, and injects its SHA into `finalCommit`.

## Tester

Use [tester.md](tester.md). Exact substitutions equal the reviewer set. Run immutable `npm run check` in a disposable copy and transfer no mutation. Maximum 900 seconds.

## Evaluator

Use [blinded-evaluator.md](blinded-evaluator.md). Exact substitutions: `PACKAGE_LABEL`, `PACKAGE_PATH`, `EVALUATION_SEQUENCE`, `RUBRIC_PATH`, `EVALUATION_SCHEMA_PATH`, `HIDDEN_SUITE_PATH`, `HIDDEN_SUITE_SHA256`, `WALL_CLOCK_DEADLINE_ISO`.

Launch one fresh evaluator for exactly one history-free X/Y/Z package in randomized order. Keep the private mapping/manifest outside its input. Bind the package seal, manifest schema/packager, rubric, and hidden suite. Record mapping guess/confidence and observable diagnostics, seal before the next launch, and prohibit revisions. Maximum 1800 seconds.

## Deterministic roles

The unblinder and Git worker are non-model roles. Unblind only after all three evaluation artifacts seal. Keep Git operations scoped to the expressly authorized worktree/ref; do not publish, merge, tag, release, or alter settings without separate authorization.
