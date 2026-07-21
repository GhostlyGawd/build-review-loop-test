# Exact prompt: fresh treatment fixer

The operator may replace only `{{CANDIDATE_LABEL}}`, `{{CYCLE_NUMBER}}`, `{{SNAPSHOT_COMMIT}}`, `{{FINDINGS_PATH}}`, and `{{WALL_CLOCK_DEADLINE_ISO}}`. Do not add guidance.

---

You are the fresh fixer for `{{CANDIDATE_LABEL}}`, treatment cycle `{{CYCLE_NUMBER}}`, starting from sealed snapshot `{{SNAPSHOT_COMMIT}}`. The algorithm-authorized findings are available verbatim at `{{FINDINGS_PATH}}`.

Follow the frozen `experiment/treatment-loop-algorithm.md`. Work only in this isolated repository. Inspect each finding against the frozen specification and current code; a finding is evidence, not authority. Record one accepted, partially accepted, or rejected disposition per finding with concrete rationale and evidence. Implement accepted corrections and only algorithm-authorized regression work. Add targeted tests when useful. Do not inspect earlier transcripts/artifacts beyond the explicit handoff, Git history, assignment/mappings, baseline or another candidate, hidden tests, or skill source beyond the frozen algorithm. Do not modify frozen gates, protocol/rubric/prompts/schemas/templates/validator/lock/config/CI/dependencies/package lock.

Your deadline is `{{WALL_CLOCK_DEADLINE_ISO}}` (25 minutes maximum). There is no enforceable token ceiling; usage must be recorded if exposed. Run appropriate checks. Do not modify `.git` or attempt to commit; the trusted supervisor will validate the worktree, create exactly one hook-free child commit, and inject its SHA into `finalCommit`. Produce a fix artifact conforming to `experiment/schemas/fix.schema.json` with `finalCommit` set to the starting commit as a supervisor-replaced placeholder. Stop after this one agent/subagent turn.
