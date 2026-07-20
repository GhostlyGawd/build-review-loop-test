import { useMemo, useState, type FormEvent } from "react";
import { evaluatePermission } from "./permissions/evaluate";
import {
  ACTIONS,
  GROUPS,
  INITIAL_RULES,
  RESOURCES,
  USERS,
  type Action,
  type Effect,
  type GroupId,
  type PermissionRule,
  type ResourceId,
  type SubjectType,
  type UserId,
} from "./permissions/model";

type SubjectId = PermissionRule["subjectId"];

interface PolicyState {
  rules: PermissionRule[];
  nextRuleNumber: number;
}

const cloneInitialRules = () => INITIAL_RULES.map((rule) => ({ ...rule }));

const subjectOptions: Record<
  SubjectType,
  readonly { id: SubjectId; label: string }[]
> = {
  everyone: [{ id: "everyone", label: "Everyone" }],
  group: GROUPS,
  user: USERS,
};

const labelFor = <T extends string>(
  records: readonly { id: T; label: string }[],
  id: T,
) => records.find((record) => record.id === id)?.label ?? id;

function RulesTable({
  rules,
  onToggle,
  onDelete,
}: {
  rules: readonly PermissionRule[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (rules.length === 0) {
    return (
      <p className="empty-state">No policy rules. Access defaults to denied.</p>
    );
  }

  return (
    <div className="table-scroll rule-table-wrap">
      <table className="rule-table">
        <thead>
          <tr>
            <th scope="col">Rule</th>
            <th scope="col">Subject</th>
            <th scope="col">Resource</th>
            <th scope="col">Permission</th>
            <th scope="col">Effect</th>
            <th scope="col">Scope</th>
            <th scope="col">Enabled</th>
            <th scope="col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rules.map((rule) => {
            const subjectLabel =
              rule.subjectType === "everyone"
                ? "Everyone"
                : rule.subjectType === "group"
                  ? labelFor(GROUPS, rule.subjectId as GroupId)
                  : labelFor(USERS, rule.subjectId as UserId);
            return (
              <tr
                key={rule.id}
                className={rule.enabled ? undefined : "is-disabled"}
              >
                <th scope="row">
                  <code>{rule.id}</code>
                </th>
                <td>
                  <span>{subjectLabel}</span>
                  <small>{rule.subjectType}</small>
                </td>
                <td>{labelFor(RESOURCES, rule.resourceId)}</td>
                <td>{labelFor(ACTIONS, rule.action)}</td>
                <td>
                  <span className={`effect effect--${rule.effect}`}>
                    {rule.effect === "allow" ? "Allow" : "Deny"}
                  </span>
                </td>
                <td>
                  {rule.appliesToDescendants
                    ? "This resource + descendants"
                    : "This resource only"}
                </td>
                <td>
                  <label className="switch-control">
                    <input
                      type="checkbox"
                      checked={rule.enabled}
                      onChange={() => onToggle(rule.id)}
                      aria-label={`Enable ${rule.id}`}
                    />
                    <span aria-hidden="true" className="switch" />
                    <span className="sr-only">
                      {rule.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </label>
                </td>
                <td>
                  <button
                    className="button button--danger button--small"
                    type="button"
                    onClick={() => onDelete(rule.id)}
                  >
                    Delete <span className="sr-only">{rule.id}</span>
                    <span aria-hidden="true">rule</span>
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function PermissionsPlayground() {
  const [policy, setPolicy] = useState<PolicyState>(() => ({
    rules: cloneInitialRules(),
    nextRuleNumber: 8,
  }));
  const [subjectType, setSubjectType] = useState<SubjectType>("everyone");
  const [subjectId, setSubjectId] = useState<SubjectId>("everyone");
  const [newResourceId, setNewResourceId] = useState<ResourceId>("workspace");
  const [newAction, setNewAction] = useState<Action>("view");
  const [newEffect, setNewEffect] = useState<Effect>("allow");
  const [newDescendants, setNewDescendants] = useState(false);
  const [userId, setUserId] = useState<UserId>("ben");
  const [resourceId, setResourceId] = useState<ResourceId>("runbook");
  const [action, setAction] = useState<Action>("edit");

  const checkerResult = useMemo(
    () => evaluatePermission(policy.rules, userId, resourceId, action),
    [policy.rules, userId, resourceId, action],
  );

  const setNewSubjectType = (nextType: SubjectType) => {
    setSubjectType(nextType);
    const validOptions = subjectOptions[nextType];
    if (!validOptions.some((option) => option.id === subjectId)) {
      const firstOption = validOptions[0];
      if (firstOption) setSubjectId(firstOption.id);
    }
  };

  const addRule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPolicy((current) => ({
      rules: [
        ...current.rules,
        {
          id: `rule-${current.nextRuleNumber}`,
          subjectType,
          subjectId,
          resourceId: newResourceId,
          action: newAction,
          effect: newEffect,
          appliesToDescendants: newDescendants,
          enabled: true,
        },
      ],
      nextRuleNumber: current.nextRuleNumber + 1,
    }));
  };

  const selectedUser = labelFor(USERS, userId);
  const selectedResource = labelFor(RESOURCES, resourceId);
  const selectedAction = labelFor(ACTIONS, action);

  return (
    <main>
      <header className="hero">
        <div>
          <p className="eyebrow">Local policy simulator</p>
          <h1>Permissions Playground</h1>
          <p className="lede">
            Explore how scope, subject specificity, and explicit denies
            resolve—without sending or saving policy data.
          </p>
        </div>
        <div className="hero-note" aria-label="Evaluation order">
          <span>Resolution order</span>
          <strong>
            Closest resource → most specific subject → deny on a tie
          </strong>
        </div>
      </header>

      <section className="panel" aria-labelledby="policy-rules-heading">
        <div className="section-heading">
          <div>
            <p className="section-kicker">01 · Define</p>
            <h2 id="policy-rules-heading">Policy rules</h2>
            <p>
              {policy.rules.length}{" "}
              {policy.rules.length === 1 ? "rule" : "rules"} in the current
              in-memory policy
            </p>
          </div>
          <button
            className="button button--secondary"
            type="button"
            onClick={() =>
              setPolicy({ rules: cloneInitialRules(), nextRuleNumber: 8 })
            }
          >
            Reset policy
          </button>
        </div>

        <RulesTable
          rules={policy.rules}
          onToggle={(id) =>
            setPolicy((current) => ({
              ...current,
              rules: current.rules.map((rule) =>
                rule.id === id ? { ...rule, enabled: !rule.enabled } : rule,
              ),
            }))
          }
          onDelete={(id) =>
            setPolicy((current) => ({
              ...current,
              rules: current.rules.filter((rule) => rule.id !== id),
            }))
          }
        />

        <form className="add-rule" onSubmit={addRule}>
          <div className="form-heading">
            <div>
              <h3>Add a rule</h3>
              <p>New rules are enabled and evaluated immediately.</p>
            </div>
            <span className="next-id">
              Next ID <code>rule-{policy.nextRuleNumber}</code>
            </span>
          </div>
          <div className="form-grid">
            <label>
              <span>Subject type</span>
              <select
                value={subjectType}
                onChange={(event) =>
                  setNewSubjectType(event.target.value as SubjectType)
                }
              >
                <option value="everyone">Everyone</option>
                <option value="group">Group</option>
                <option value="user">User</option>
              </select>
            </label>
            <label>
              <span>Subject</span>
              <select
                value={subjectId}
                onChange={(event) =>
                  setSubjectId(event.target.value as SubjectId)
                }
              >
                {subjectOptions[subjectType].map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Resource</span>
              <select
                value={newResourceId}
                onChange={(event) =>
                  setNewResourceId(event.target.value as ResourceId)
                }
              >
                {RESOURCES.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Action</span>
              <select
                value={newAction}
                onChange={(event) => setNewAction(event.target.value as Action)}
              >
                {ACTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Effect</span>
              <select
                value={newEffect}
                onChange={(event) => setNewEffect(event.target.value as Effect)}
              >
                <option value="allow">Allow</option>
                <option value="deny">Deny</option>
              </select>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={newDescendants}
                onChange={(event) => setNewDescendants(event.target.checked)}
              />
              <span>Apply to descendants</span>
            </label>
            <button className="button button--primary" type="submit">
              Add rule
            </button>
          </div>
        </form>
      </section>

      <section
        className="panel checker-panel"
        aria-labelledby="check-access-heading"
      >
        <div className="section-heading">
          <div>
            <p className="section-kicker">02 · Inspect</p>
            <h2 id="check-access-heading">Check access</h2>
            <p>Choose one request to see its winning policy tier.</p>
          </div>
        </div>
        <div className="checker-grid">
          <div className="checker-controls">
            <label>
              <span>User</span>
              <select
                value={userId}
                onChange={(event) => setUserId(event.target.value as UserId)}
              >
                {USERS.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Resource</span>
              <select
                value={resourceId}
                onChange={(event) =>
                  setResourceId(event.target.value as ResourceId)
                }
              >
                {RESOURCES.map((resource) => (
                  <option key={resource.id} value={resource.id}>
                    {resource.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Permission</span>
              <select
                value={action}
                onChange={(event) => setAction(event.target.value as Action)}
              >
                {ACTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className={`decision decision--${checkerResult.allowed ? "allowed" : "denied"}`}
            role="status"
            aria-live="polite"
          >
            <p className="decision-label">Effective decision</p>
            <strong>{checkerResult.allowed ? "Allowed" : "Denied"}</strong>
            <p>
              {selectedUser} · {selectedResource} · {selectedAction}
            </p>
            <p className="decision-reason">{checkerResult.reason}</p>
          </div>
        </div>
      </section>

      <section
        className="panel"
        aria-labelledby="effective-permissions-heading"
      >
        <div className="section-heading">
          <div>
            <p className="section-kicker">03 · Compare</p>
            <h2 id="effective-permissions-heading">Effective permissions</h2>
            <p>
              Every user, resource, and action combination in the closed domain.
            </p>
          </div>
          <div className="legend" aria-label="Decision legend">
            <span className="legend-allowed">✓ Allowed</span>
            <span className="legend-denied">× Denied</span>
          </div>
        </div>
        <div
          className="table-scroll matrix-wrap"
          tabIndex={0}
          aria-label="Scrollable effective permissions table"
        >
          <table className="matrix-table">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Resource</th>
                {ACTIONS.map((item) => (
                  <th scope="col" key={item.id}>
                    {item.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {USERS.flatMap((user) =>
                RESOURCES.map((resource, resourceIndex) => (
                  <tr key={`${user.id}-${resource.id}`}>
                    {resourceIndex === 0 && (
                      <th scope="rowgroup" rowSpan={RESOURCES.length}>
                        {user.label}
                      </th>
                    )}
                    <th scope="row">{resource.label}</th>
                    {ACTIONS.map((item) => {
                      const result = evaluatePermission(
                        policy.rules,
                        user.id,
                        resource.id,
                        item.id,
                      );
                      const status = result.allowed ? "Allowed" : "Denied";
                      return (
                        <td key={item.id}>
                          <span
                            className={`matrix-status matrix-status--${result.allowed ? "allowed" : "denied"}`}
                            aria-label={`${user.label}, ${resource.label}, ${item.label}, ${status}`}
                          >
                            <span aria-hidden="true">
                              {result.allowed ? "✓" : "×"}
                            </span>{" "}
                            {status}
                          </span>
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

      <footer>
        <p>
          Educational sandbox only. This client-side evaluator is not a
          production authorization system.
        </p>
      </footer>
    </main>
  );
}
