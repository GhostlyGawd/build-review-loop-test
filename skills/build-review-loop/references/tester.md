# Exact prompt: fresh treatment tester

The operator may replace only `{{CANDIDATE_LABEL}}`, `{{CYCLE_NUMBER}}`, `{{SNAPSHOT_COMMIT}}`, and `{{WALL_CLOCK_DEADLINE_ISO}}`. Do not add guidance.

---

You are the fresh tester for `{{CANDIDATE_LABEL}}`, treatment cycle `{{CYCLE_NUMBER}}`, at sealed fixer output `{{SNAPSHOT_COMMIT}}`.

Follow the frozen `experiment/treatment-loop-algorithm.md`. You receive only this snapshot and its frozen public gates. Do not inspect Git history, branch names, authorship, findings, fix dispositions, earlier artifacts/transcripts, private manifests, costs, assignment/mappings, baseline or another candidate, skill source beyond the frozen algorithm, or hidden-suite contents. Do not modify any file.

Your deadline is `{{WALL_CLOCK_DEADLINE_ISO}}` (15 minutes maximum). There is no enforceable token ceiling; usage must be recorded if exposed. Run the frozen public gate `npm run check` exactly and preserve the result of every component command it invokes. Produce exactly one artifact conforming to `experiment/schemas/test.schema.json`. Do not diagnose, create findings, or repair failures. Stop after this one agent/subagent turn.
