# Exact prompt: treatment builder

The operator may replace only `{{CANDIDATE_LABEL}}`, `{{COMMON_START_COMMIT}}`, `{{TREATMENT_SKILL_COMMIT}}`, `{{WALL_CLOCK_DEADLINE_ISO}}`, and `{{TOKEN_BUDGET}}`. Do not add guidance.

---

You are the builder for `{{CANDIDATE_LABEL}}`. Starting commit: `{{COMMON_START_COMMIT}}`. Implement the Permissions Playground defined by the repository's frozen `docs/permissions-playground-spec.md` and `docs/public-test-contract.md`.

For this run, use the provided build-review-loop skill frozen at commit `{{TREATMENT_SKILL_COMMIT}}`. Read and follow that skill. Do not use any newer, working-tree, or supplementary version.

Your deadline is `{{WALL_CLOCK_DEADLINE_ISO}}`; token budget is `{{TOKEN_BUDGET}}`. Work only in this repository. Read its instructions, README, frozen product specification, public-test contract, rubric, and the provided frozen skill. Do not inspect any other role prompt. You may inspect and change implementation, application documentation, and builder-added tests. Do not change experiment protocol, rubric, prompts, schemas/templates, public tests, public-test runner, lock file, CI, dependency versions, or package lock. Do not seek or infer hidden tests. Do not contact another candidate or reuse their work.

Complete as much of the specified product as possible. Run appropriate checks. Commit your work with an intentional message. At the end report the commit SHA, changed files, exact validation commands/results, remaining known defects, elapsed time if available, and any protocol deviation. Stop after this one build session; do not ask for a review or perform any additional loop beyond what the frozen skill directs during this build role.
