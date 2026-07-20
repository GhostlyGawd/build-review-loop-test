# Blinded evaluation rubric (100 points)

Score the checked-out final snapshot, not intent or review prose. Use public tests, the frozen hidden suite, source inspection, keyboard inspection, and a 320 px / desktop browser check. Award only the listed values unless an item says “per case.” Record evidence for every item. Reviewers/evaluators must not inspect arm identity or history.

## A. Functional correctness — 50 points

### A1. Domain and initial fixture — 6

- **6:** exact closed domain, hierarchy, memberships, actions, and all seven initial rules including order/flags.
- **3:** domain is usable but has one localized fixture/label/flag defect.
- **0:** multiple defects, missing entities, or materially different domain.

### A2. Evaluator matching and default deny — 8

- **8:** enabled/action/subject/resource matching and default-deny behavior are all exact.
- **4:** one localized edge case fails without a permissive security failure.
- **0:** multiple failures, default allow, mutation/I/O, or unusable evaluator.

### A3. Precedence and explanation payload — 10

- **10:** distance, specificity, tied deny, sorted complete winner IDs, and specified reason all exact.
- **7:** decision results are exact with one explanation/winner-order defect.
- **4:** common decisions work but one precedence class fails.
- **0:** multiple precedence classes fail or evaluator is absent.

### A4. Rule management — 10

- **10:** render/add/enable-disable/delete/reset all meet exact ID, subject constraint, and immediate-update semantics.
- **7:** all operations work with one localized ID/reset/constraint defect.
- **4:** at least three operations work, with no silent data corruption.
- **0:** fewer than three work or region is absent.

### A5. Check-access workflow — 7

- **7:** exact initial query, labeled controls, immediate recomputation, status, readable query, and correct explanation.
- **4:** correct evaluation is usable but one presentation/initialization requirement fails.
- **0:** query cannot be completed or produces wrong results broadly.

### A6. Complete effective matrix — 7

- **7:** all 36 unique combinations, correct accessible status text, and immediate policy updates.
- **4:** all combinations exist with one localized labeling/update defect.
- **0:** combinations are missing/duplicated broadly, stale, or absent.

### A7. Application integration — 2

- **2:** default component is rendered by `main.tsx`; production build and direct-load SPA work without console errors.
- **1:** product renders but has a localized integration/console defect.
- **0:** placeholder remains, build fails, or product does not render.

**Functional cap:** if the production build fails or the product cannot render, section A is capped at 10. Any default-allow behavior caps A2+A3 at 4 combined.

## B. Robustness and security — 15 points

### B1. State integrity and deterministic changes — 5

- **5:** rapid/repeated add, toggle, delete, and reset preserve unique IDs, immutable evaluation inputs, and consistent derived views.
- **3:** one recoverable localized state defect.
- **0:** corruption, duplicate IDs, render crash, or nondeterminism.

### B2. Closed-input and execution boundaries — 5

- **5:** constrained inputs only; no network/persistence/secrets; no HTML injection, `eval`, or `Function`; no misleading production-security claim.
- **3:** safe behavior with one non-exploitable boundary/documentation defect.
- **0:** network/persistence, executable injection sink, secret dependency, or production authorization claim.

### B3. Edge behavior and runtime hygiene — 5

- **5:** zero-match, tied matches, last-rule deletion, disabled rules, descendants, and reset behave without uncaught errors or console warnings.
- **3:** one localized edge/console defect.
- **0:** multiple defects or common interactions crash.

**Security cap:** an executable injection sink or unexpected network transmission caps the total score at 50, even if inert in the fixture.

## C. Accessibility and usability — 15 points

### C1. Names, roles, structure, announcements — 6

- **6:** one h1/logical headings; every control and matrix result is accessibly named; checker uses a live status; table/region semantics are coherent.
- **3:** one or two localized naming/semantic defects.
- **0:** broad unlabeled controls, inaccessible results, or missing structure.

### C2. Keyboard and focus — 4

- **4:** all workflows keyboard-operable in logical order with clear visible focus and no traps.
- **2:** operable with one localized order/focus defect.
- **0:** a required workflow is keyboard-blocked or focus is broadly invisible.

### C3. Readability and responsive use — 5

- **5:** status is not color-only, contrast targets AA, controls communicate hierarchy/state clearly, and 320 px use has no inaccessible clipping.
- **3:** coherent design with one localized contrast/responsive/status defect.
- **0:** required content is unreadable/inaccessible or presentation is substantially unstyled/confusing.

## D. Test effectiveness — 10 points

### D1. Builder-added behavioral coverage — 4

- **4:** meaningful added tests cover rule mutations and UI-derived updates beyond public cases.
- **2:** useful added tests cover at least one nontrivial behavior.
- **0:** no meaningful added tests, snapshots only, or assertions do not exercise behavior.

### D2. Edge and regression sensitivity — 4

- **4:** tests distinguish distance vs specificity, tied deny, disabled/deleted rules, reset IDs, and at least one accessibility behavior.
- **2:** tests distinguish at least three of those categories.
- **0:** fewer than three or tests are ineffective.

### D3. Determinism and honesty — 2

- **2:** tests are deterministic, isolated, and pass for the right reason; frozen tests/runners are untouched.
- **1:** minor isolation/flakiness risk without false passing.
- **0:** skipped/weakened/falsified tests, network dependence, or material flakiness.

## E. Maintainability and documentation — 10 points

### E1. Model/evaluator separation and type quality — 3

- **3:** closed-domain types are precise, evaluator is pure and separately testable, and state/derived behavior has clear boundaries.
- **2:** generally clear with one localized type/coupling issue.
- **1:** substantial duplication/coupling but understandable.
- **0:** unsafe types or structure obscures correctness.

### E2. Component clarity and change cost — 3

- **3:** names and component boundaries make one rule-field or fixture change localized; no needless abstraction or repeated policy algorithm.
- **2:** understandable with moderate duplication/oversized component.
- **1:** difficult but feasible to change safely.
- **0:** opaque, generated-looking sprawl or conflicting algorithms.

### E3. Product documentation truthfulness — 2

- **2:** README status/setup/commands/architecture/limitations/security are updated to the implemented state and do not overclaim.
- **1:** useful but one material omission/stale scaffold statement.
- **0:** misleading, unusable, or absent.

### E4. Code comments and repository hygiene — 2

- **2:** comments explain only non-obvious choices; no dead code, committed build output, secrets, unrelated changes, or dependency churn.
- **1:** one localized hygiene/comment issue.
- **0:** multiple issues or material unrelated/churned content.

## Score record

The evaluator records all item scores, section subtotals, caps applied, evidence paths/test IDs, and a concise rationale in an artifact conforming to `experiment/schemas/evaluation.schema.json`. Section subtotals must equal 50/15/15/10/10 maxima and the uncapped total must equal their sum before any overall cap.
