# Permissions Playground specification

Version: 1.0.0-frozen

Normative terms: **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are requirements keywords. When prose, public tests, and examples appear to conflict, the numbered normative rules in this document win. Ambiguity must be logged as a deviation; builders must not silently invent semantics.

## 1. Product goal

Build a single-page, client-only React application that lets a user inspect and change a small access-control policy, then see the effective permission for every user/resource/action combination. It is an explanatory policy sandbox, not a production authorization system.

The application MUST be titled `Permissions Playground` and MUST expose three visible regions in this order:

1. `Policy rules`: the current rules and controls to add, enable/disable, and delete them.
2. `Check access`: controls for one user/resource/action query and an explanation of its result.
3. `Effective permissions`: the complete 3 × 4 × 3 matrix of results.

The layout MAY change responsively. All behavior is local and in memory. A reload MAY return to the initial fixture; persistence is out of scope.

## 2. Closed domain

Builders MUST use these exact identifiers and labels. They MUST NOT add users, groups, resources, or actions.

### 2.1 Users and groups

| User ID | Label | Group memberships         |
| ------- | ----- | ------------------------- |
| `ada`   | Ada   | `engineering`             |
| `ben`   | Ben   | `engineering`, `security` |
| `cy`    | Cy    | none                      |

Groups are `engineering` (Engineering) and `security` (Security). `everyone` is a special subject that matches every user; it is not a group and cannot be edited.

### 2.2 Resources

Resources form one fixed tree. A resource is its own descendant for matching purposes.

```text
workspace (Workspace)
└── atlas (Project Atlas)
    ├── runbook (Runbook)
    └── budget (Budget)
```

The parent of `atlas` is `workspace`; the parent of `runbook` and `budget` is `atlas`; `workspace` has no parent. The tree cannot be edited.

### 2.3 Actions and effects

Actions are `view` (View), `edit` (Edit), and `share` (Share). Actions are independent: for example, allowing `edit` does not imply `view`.

Effects are `allow` (Allow) and `deny` (Deny).

## 3. Rule model and initial fixture

Each rule has exactly these fields:

| Field                  | Meaning                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `id`                   | Stable, non-empty string unique in the current policy               |
| `subjectType`          | `everyone`, `group`, or `user`                                      |
| `subjectId`            | `everyone`; a group ID; or a user ID, consistent with `subjectType` |
| `resourceId`           | One resource ID                                                     |
| `action`               | One action ID                                                       |
| `effect`               | `allow` or `deny`                                                   |
| `appliesToDescendants` | Boolean inheritance switch                                          |
| `enabled`              | Boolean participation switch                                        |

The initial ordered rule list MUST be:

| ID       | Subject     | Resource      | Action | Effect | Descendants | Enabled |
| -------- | ----------- | ------------- | ------ | ------ | ----------- | ------- |
| `rule-1` | Everyone    | Workspace     | View   | Allow  | yes         | yes     |
| `rule-2` | Engineering | Project Atlas | Edit   | Allow  | yes         | yes     |
| `rule-3` | Security    | Project Atlas | Share  | Allow  | yes         | yes     |
| `rule-4` | Ben         | Runbook       | Edit   | Deny   | no          | yes     |
| `rule-5` | Cy          | Budget        | View   | Allow  | no          | yes     |
| `rule-6` | Everyone    | Budget        | View   | Deny   | no          | yes     |
| `rule-7` | Ada         | Runbook       | Share  | Allow  | no          | no      |

## 4. Effective-permission algorithm

For a query `(userId, resourceId, action)`, implementations MUST use the following algorithm without implicit roles, action inheritance, or rule-order effects.

1. Discard every disabled rule and every rule whose action differs from the query action.
2. A rule subject matches when:
   - `everyone` matches any user;
   - a `group` rule matches only when the queried user is in that fixed group; or
   - a `user` rule matches only when the IDs are equal.
3. A rule resource matches when its resource equals the queried resource, or when `appliesToDescendants` is true and the queried resource is a strict descendant of the rule resource.
4. For every matching rule, calculate `resourceDistance`: zero for an exact resource; otherwise the number of parent edges from the queried resource to the rule resource. Calculate `subjectSpecificity`: 3 for user, 2 for group, 1 for everyone.
5. If no rules match, return Denied with reason `No matching rule; default deny.` and no winner IDs.
6. Keep only matches with the smallest `resourceDistance`.
7. From those, keep only matches with the greatest `subjectSpecificity`.
8. These remaining rules are the winning tier. If any winning-tier rule is `deny`, return Denied; otherwise return Allowed.
9. Return every winning-tier rule ID, sorted lexicographically, in the explanation. Rule list order and ID order MUST NOT otherwise affect the decision.

This precedence means closer resources beat broader inherited rules, more specific subjects beat less specific subjects at the same resource distance, and deny wins only within an otherwise tied tier. Default is deny.

### 4.1 Normative initial outcomes

- Ada / Runbook / View → Allowed by `rule-1`.
- Ben / Runbook / Edit → Denied by `rule-4` (exact user rule beats inherited group rule).
- Ben / Budget / Share → Allowed by `rule-3`.
- Cy / Budget / View → Allowed by `rule-5` (exact user rule beats exact everyone deny).
- Cy / Runbook / Edit → Denied by default.
- Ada / Runbook / Share → Denied by default because `rule-7` is disabled.

If `rule-5` is disabled or deleted, Cy / Budget / View becomes Denied by `rule-6`. If `rule-7` is enabled, Ada / Runbook / Share becomes Allowed by `rule-7`.

## 5. Required model exports

The implementation MUST create `src/permissions/model.ts` and export:

- string-union types `UserId`, `GroupId`, `ResourceId`, `Action`, `Effect`, and `SubjectType` containing exactly the IDs above;
- interfaces `PermissionRule` and `EvaluationResult` matching this specification;
- readonly data exports `USERS`, `GROUPS`, `RESOURCES`, `ACTIONS`, and `INITIAL_RULES`;
- `EvaluationResult.allowed: boolean`, `winnerIds: string[]`, and `reason: string`.

The data records MUST have these exact shapes: users `{ id, label, groupIds }`; groups `{ id, label }`; resources `{ id, label, parentId }` where the root parent is `null`; actions `{ id, label }`; and rules with the fields in section 3. Arrays MUST preserve the order shown in sections 2 and 3. Extra record fields are allowed only if they do not change serialized values used by the UI or evaluator.

It MUST create `src/permissions/evaluate.ts` and export:

```ts
evaluatePermission(
  rules: readonly PermissionRule[],
  userId: UserId,
  resourceId: ResourceId,
  action: Action,
): EvaluationResult
```

The function MUST be pure: it cannot mutate its arguments, read UI state, use time/randomness, or perform I/O.

## 6. Policy-rules interaction

The rules region MUST render one row per current rule and expose the rule ID plus human-readable subject, resource, action, effect, descendant scope, and enabled status.

- Every row MUST have an accessible checkbox named `Enable <rule-id>`. Toggling it immediately updates the checker and matrix.
- Every row MUST have a button named `Delete <rule-id>`. Deletion immediately updates derived results.
- A button named `Reset policy` MUST restore the exact initial fixture and reset the next generated ID to `rule-8`.
- The add-rule form MUST expose labeled controls `Subject type`, `Subject`, `Resource`, `Action`, `Effect`, and a checkbox `Apply to descendants`, plus a button named `Add rule`.
- The Subject choices MUST be constrained by Subject type. `everyone` has the single subject value `everyone`; group exposes the two group IDs; user exposes the three user IDs. Changing Subject type MUST select the first valid value if the old value is invalid.
- Submitting creates an enabled rule appended to the list. IDs MUST be `rule-N`, where N starts at 8 and increases by one per successful add. Deleted numbers MUST NOT be reused before reset.
- The form is fully constrained, so a valid selection always exists. Duplicate semantic rules are allowed and are resolved by the normal algorithm.

## 7. Check-access interaction

The checker MUST expose labeled select controls `User`, `Resource`, and `Permission`. Its initial query MUST be Ben / Runbook / Edit. Results MUST recompute immediately on select or policy changes; no submit button is required.

The result MUST be inside a live status region (`role="status"` or equivalent) and include:

- the exact visible word `Allowed` or `Denied`;
- the selected human-readable user, resource, and action;
- either all sorted winning IDs or the exact default-deny reason.

The explanation MAY add prose but MUST NOT contradict the evaluator result.

## 8. Effective-permissions matrix

The matrix MUST contain all 36 user/resource/action combinations exactly once and recompute immediately after policy edits. A semantic table is preferred. Each result cell MUST have an accessible name containing the user label, resource label, action label, and `Allowed` or `Denied`. Color MUST NOT be the only status indicator.

The UI MAY group resource/action columns visually. It MUST remain usable at 320 CSS pixels through horizontal scrolling, stacking, or another non-clipping presentation.

## 9. Accessibility, states, and visual requirements

- `src/PermissionsPlayground.tsx` MUST default-export the completed component, and `src/main.tsx` MUST render it instead of the Phase 1 notice.
- All interactive controls MUST be keyboard reachable and have persistent accessible names from labels or equivalent semantics.
- Focus indicators MUST be visibly distinct. Text and essential UI MUST target WCAG 2.2 AA contrast.
- Status MUST be expressed in text, not color alone. Native controls MAY be used.
- The page MUST have exactly one `h1`, with logical section headings beneath it.
- No expected state is asynchronous. The UI MUST NOT add fake loading delays.
- Unexpected render errors MUST not be intentionally swallowed. A custom error boundary is optional.
- The completed UI SHOULD have a coherent, deliberate visual system and avoid unstyled browser-default presentation.

## 10. Security and privacy boundaries

The implementation MUST NOT make network requests, persist policy data, accept HTML, call `eval`/`Function`, require secrets, or claim that this educational evaluator is safe for production authorization. Rule content comes only from closed select controls; free-text policy fields are out of scope.

## 11. Out of scope

Authentication, authorization enforcement, servers, databases, imports/exports, undo/redo, draggable rule order, editable users/groups/resource hierarchy, dark/light mode requirements, and production deployment are explicitly out of scope. Builders may polish within the contract but MUST NOT replace required behavior with broader features.
