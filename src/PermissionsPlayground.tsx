import { useState } from "react";
import type { FormEvent } from "react";
import { evaluatePermission } from "./permissions/evaluate";
import {
  ACTIONS,
  GROUPS,
  INITIAL_RULES,
  RESOURCES,
  USERS,
} from "./permissions/model";
import type {
  Action,
  Effect,
  GroupId,
  PermissionRule,
  ResourceId,
  SubjectId,
  SubjectType,
  UserId,
} from "./permissions/model";

interface RuleFormState {
  subjectType: SubjectType;
  subjectId: SubjectId;
  resourceId: ResourceId;
  action: Action;
  effect: Effect;
  appliesToDescendants: boolean;
}

interface QueryState {
  userId: UserId;
  resourceId: ResourceId;
  action: Action;
}

const DEFAULT_FORM: RuleFormState = {
  subjectType: "everyone",
  subjectId: "everyone",
  resourceId: "workspace",
  action: "view",
  effect: "allow",
  appliesToDescendants: true,
};

const DEFAULT_QUERY: QueryState = {
  userId: "ben",
  resourceId: "runbook",
  action: "edit",
};

function getUserLabel(userId: UserId): string {
  const user = USERS.find((candidate) => candidate.id === userId);
  if (!user) {
    throw new Error(`Unknown user: ${userId}`);
  }
  return user.label;
}

function getGroupLabel(groupId: GroupId): string {
  const group = GROUPS.find((candidate) => candidate.id === groupId);
  if (!group) {
    throw new Error(`Unknown group: ${groupId}`);
  }
  return group.label;
}

function getResourceLabel(resourceId: ResourceId): string {
  const resource = RESOURCES.find((candidate) => candidate.id === resourceId);
  if (!resource) {
    throw new Error(`Unknown resource: ${resourceId}`);
  }
  return resource.label;
}

function getActionLabel(action: Action): string {
  const actionRecord = ACTIONS.find((candidate) => candidate.id === action);
  if (!actionRecord) {
    throw new Error(`Unknown action: ${action}`);
  }
  return actionRecord.label;
}

function describeSubject(
  rule: Pick<PermissionRule, "subjectType" | "subjectId">,
): string {
  if (rule.subjectType === "everyone") {
    return "Everyone";
  }

  if (rule.subjectType === "group") {
    if (rule.subjectId === "everyone") {
      throw new Error("Group rules cannot target everyone");
    }

    return getGroupLabel(rule.subjectId as GroupId);
  }

  if (
    rule.subjectId === "everyone" ||
    rule.subjectId === "engineering" ||
    rule.subjectId === "security"
  ) {
    throw new Error("User rules must target a user ID");
  }

  return getUserLabel(rule.subjectId);
}

function getSubjectOptions(
  subjectType: SubjectType,
): ReadonlyArray<{ id: SubjectId; label: string }> {
  if (subjectType === "everyone") {
    return [{ id: "everyone", label: "Everyone" }];
  }

  if (subjectType === "group") {
    return GROUPS.map((group) => ({ id: group.id, label: group.label }));
  }

  return USERS.map((user) => ({ id: user.id, label: user.label }));
}

function getFirstSubjectId(subjectType: SubjectType): SubjectId {
  const [firstOption] = getSubjectOptions(subjectType);
  if (!firstOption) {
    throw new Error(`No valid subjects for ${subjectType}`);
  }
  return firstOption.id;
}

function ruleStatusLabel(rule: PermissionRule): string {
  return rule.enabled ? "Enabled" : "Disabled";
}

function ruleScopeLabel(rule: PermissionRule): string {
  return rule.appliesToDescendants
    ? "This resource + descendants"
    : "This resource only";
}

export default function PermissionsPlayground() {
  const [rules, setRules] = useState<PermissionRule[]>(
    INITIAL_RULES.map((rule) => ({ ...rule })),
  );
  const [nextRuleNumber, setNextRuleNumber] = useState(8);
  const [form, setForm] = useState<RuleFormState>(DEFAULT_FORM);
  const [query, setQuery] = useState<QueryState>(DEFAULT_QUERY);

  const queryResult = evaluatePermission(
    rules,
    query.userId,
    query.resourceId,
    query.action,
  );
  const subjectOptions = getSubjectOptions(form.subjectType);

  function handleSubjectTypeChange(nextSubjectType: SubjectType) {
    setForm((current) => ({
      ...current,
      subjectType: nextSubjectType,
      subjectId: getFirstSubjectId(nextSubjectType),
    }));
  }

  function handleToggleRule(ruleId: string) {
    setRules((current) =>
      current.map((rule) =>
        rule.id === ruleId ? { ...rule, enabled: !rule.enabled } : rule,
      ),
    );
  }

  function handleDeleteRule(ruleId: string) {
    setRules((current) => current.filter((rule) => rule.id !== ruleId));
  }

  function handleResetPolicy() {
    setRules(INITIAL_RULES.map((rule) => ({ ...rule })));
    setNextRuleNumber(8);
    setForm(DEFAULT_FORM);
  }

  function handleAddRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const newRule: PermissionRule = {
      id: `rule-${nextRuleNumber}`,
      subjectType: form.subjectType,
      subjectId: form.subjectId,
      resourceId: form.resourceId,
      action: form.action,
      effect: form.effect,
      appliesToDescendants: form.appliesToDescendants,
      enabled: true,
    };

    setRules((current) => [...current, newRule]);
    setNextRuleNumber((current) => current + 1);
  }

  return (
    <main className="playground-shell">
      <div className="playground-backdrop" />
      <div className="playground-content">
        <header className="hero">
          <p className="eyebrow">Policy sandbox</p>
          <h1>Permissions Playground</h1>
          <p className="hero-copy">
            Inspect a small access-control policy, adjust the rules, and see how
            precedence changes every effective permission.
          </p>
        </header>

        <section className="panel" aria-labelledby="policy-rules-heading">
          <div className="panel-header">
            <div>
              <h2 id="policy-rules-heading">Policy rules</h2>
              <p className="panel-copy">
                Resource distance wins first, subject specificity wins next, and
                deny only wins inside the final tied tier.
              </p>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={handleResetPolicy}
            >
              Reset policy
            </button>
          </div>

          <div className="rules-table-wrap">
            <table className="rules-table">
              <caption className="sr-only">Current policy rules</caption>
              <thead>
                <tr>
                  <th scope="col">Rule</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Resource</th>
                  <th scope="col">Action</th>
                  <th scope="col">Effect</th>
                  <th scope="col">Scope</th>
                  <th scope="col">Status</th>
                  <th scope="col">Controls</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <th scope="row">{rule.id}</th>
                    <td>{describeSubject(rule)}</td>
                    <td>{getResourceLabel(rule.resourceId)}</td>
                    <td>{getActionLabel(rule.action)}</td>
                    <td>
                      <span
                        className={`pill ${
                          rule.effect === "allow" ? "pill-allow" : "pill-deny"
                        }`}
                      >
                        {rule.effect === "allow" ? "Allow" : "Deny"}
                      </span>
                    </td>
                    <td>{ruleScopeLabel(rule)}</td>
                    <td>{ruleStatusLabel(rule)}</td>
                    <td>
                      <div className="row-controls">
                        <label className="toggle">
                          <input
                            type="checkbox"
                            aria-label={`Enable ${rule.id}`}
                            checked={rule.enabled}
                            onChange={() => handleToggleRule(rule.id)}
                          />
                          <span>Enabled</span>
                        </label>
                        <button
                          className="danger-button"
                          type="button"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          Delete {rule.id}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form className="rule-form" onSubmit={handleAddRule}>
            <div className="field-grid">
              <label className="field">
                <span>Subject type</span>
                <select
                  value={form.subjectType}
                  onChange={(event) =>
                    handleSubjectTypeChange(event.target.value as SubjectType)
                  }
                >
                  <option value="everyone">Everyone</option>
                  <option value="group">Group</option>
                  <option value="user">User</option>
                </select>
              </label>

              <label className="field">
                <span>Subject</span>
                <select
                  value={form.subjectId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      subjectId: event.target.value as SubjectId,
                    }))
                  }
                >
                  {subjectOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Resource</span>
                <select
                  value={form.resourceId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      resourceId: event.target.value as ResourceId,
                    }))
                  }
                >
                  {RESOURCES.map((resource) => (
                    <option key={resource.id} value={resource.id}>
                      {resource.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Action</span>
                <select
                  value={form.action}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      action: event.target.value as Action,
                    }))
                  }
                >
                  {ACTIONS.map((action) => (
                    <option key={action.id} value={action.id}>
                      {action.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Effect</span>
                <select
                  value={form.effect}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      effect: event.target.value as Effect,
                    }))
                  }
                >
                  <option value="allow">Allow</option>
                  <option value="deny">Deny</option>
                </select>
              </label>

              <label className="field field-checkbox">
                <input
                  type="checkbox"
                  checked={form.appliesToDescendants}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      appliesToDescendants: event.target.checked,
                    }))
                  }
                />
                <span>Apply to descendants</span>
              </label>
            </div>

            <button className="primary-button" type="submit">
              Add rule
            </button>
          </form>
        </section>

        <section className="panel" aria-labelledby="check-access-heading">
          <div className="panel-header">
            <div>
              <h2 id="check-access-heading">Check access</h2>
              <p className="panel-copy">
                Change any selector and the result recomputes immediately.
              </p>
            </div>
          </div>

          <div className="field-grid checker-grid">
            <label className="field">
              <span>User</span>
              <select
                value={query.userId}
                onChange={(event) =>
                  setQuery((current) => ({
                    ...current,
                    userId: event.target.value as UserId,
                  }))
                }
              >
                {USERS.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Resource</span>
              <select
                value={query.resourceId}
                onChange={(event) =>
                  setQuery((current) => ({
                    ...current,
                    resourceId: event.target.value as ResourceId,
                  }))
                }
              >
                {RESOURCES.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Permission</span>
              <select
                value={query.action}
                onChange={(event) =>
                  setQuery((current) => ({
                    ...current,
                    action: event.target.value as Action,
                  }))
                }
              >
                {ACTIONS.map((action) => (
                  <option key={action.id} value={action.id}>
                    {action.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="result-card" role="status" aria-live="polite">
            <p className="result-kicker">
              {queryResult.allowed ? "Allowed" : "Denied"}
            </p>
            <p className="result-summary">
              {getUserLabel(query.userId)} /{" "}
              {getResourceLabel(query.resourceId)} /{" "}
              {getActionLabel(query.action)}
            </p>
            <p className="result-reason">
              {queryResult.winnerIds.length > 0
                ? `Winning rule IDs: ${queryResult.winnerIds.join(", ")}.`
                : queryResult.reason}
            </p>
          </div>
        </section>

        <section
          className="panel"
          aria-labelledby="effective-permissions-heading"
        >
          <div className="panel-header">
            <div>
              <h2 id="effective-permissions-heading">Effective permissions</h2>
              <p className="panel-copy">
                Every user, resource, and action combination appears exactly
                once.
              </p>
            </div>
          </div>

          <div className="matrix-wrap">
            <table className="matrix-table">
              <caption className="sr-only">
                Effective permissions matrix
              </caption>
              <thead>
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Resource</th>
                  {ACTIONS.map((action) => (
                    <th key={action.id} scope="col">
                      {action.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {USERS.flatMap((user) =>
                  RESOURCES.map((resource) => (
                    <tr key={`${user.id}-${resource.id}`}>
                      <th scope="row">{user.label}</th>
                      <td>{resource.label}</td>
                      {ACTIONS.map((action) => {
                        const result = evaluatePermission(
                          rules,
                          user.id,
                          resource.id,
                          action.id,
                        );

                        return (
                          <td key={action.id}>
                            <div
                              className={`matrix-cell ${
                                result.allowed
                                  ? "matrix-cell-allow"
                                  : "matrix-cell-deny"
                              }`}
                            >
                              <span
                                aria-label={`${user.label} ${resource.label} ${action.label} ${
                                  result.allowed ? "Allowed" : "Denied"
                                }`}
                                className="matrix-state"
                              >
                                {result.allowed ? "Allowed" : "Denied"}
                              </span>
                              <span className="matrix-detail">
                                {result.winnerIds.length > 0
                                  ? result.winnerIds.join(", ")
                                  : "default deny"}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
