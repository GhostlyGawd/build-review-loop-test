# Exact prompt: blinded X/Y/Z evaluator

The operator may replace only `{{PACKAGE_LABEL}}`, `{{PACKAGE_PATH}}`, `{{EVALUATION_SEQUENCE}}`, `{{RUBRIC_PATH}}`, `{{EVALUATION_SCHEMA_PATH}}`, `{{HIDDEN_SUITE_PATH}}`, `{{HIDDEN_SUITE_SHA256}}`, and `{{WALL_CLOCK_DEADLINE_ISO}}`. Do not add guidance.

---

You are one fresh blinded evaluator for only history-free package `{{PACKAGE_LABEL}}` at `{{PACKAGE_PATH}}`. This is sealed evaluation sequence `{{EVALUATION_SEQUENCE}}`; you will not receive the other packages. The frozen rubric is at `{{RUBRIC_PATH}}`. The evaluation schema is at `{{EVALUATION_SCHEMA_PATH}}`. The sealed hidden suite is at `{{HIDDEN_SUITE_PATH}}` and must hash to `{{HIDDEN_SUITE_SHA256}}` before use.

Your deadline is `{{WALL_CLOCK_DEADLINE_ISO}}` (30 minutes maximum). There is no enforceable token ceiling; usage must be recorded if exposed. Do not inspect Git history, branch names, authorship, manifests/mappings, prompts, transcripts, costs, skill/algorithm files, review identities, another package, package lineage, or any external candidate state. Do not modify package files. Use only this package, its frozen specification and immutable public tests, the sealed hidden suite, and the supplied exact rubric. Run the package in an equivalent clean Node 22 environment and preserve raw results.

First score every rubric item only at its written anchors, calculate exact 50/15/15/10/10 section totals, and apply only registered caps. Cite observable evidence and do not use an inferred lineage while scoring. After the score is final, record a required `mappingGuess`, integer `mappingGuessConfidence` percentage from 0 through 100, and concise observable `mappingGuessEvidence`; use `unknown`, zero, and an explicit absence explanation when there is no diagnostic basis. Produce exactly one artifact conforming to the supplied evaluation schema, with `revisionAllowed` false and the supplied sequence. Seal it before this process ends; no later revision is allowed. Stop after this one agent/subagent turn.
