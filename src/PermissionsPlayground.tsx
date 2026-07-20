import { useMemo, useRef, useState, type FormEvent } from "react";
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
  type SubjectId,
  type SubjectType,
  type UserId,
} from "./permissions/model";
import "./playground.css";

const subjectTypeLabels: Record<SubjectType, string> = {
  everyone: "Everyone",
  group: "Group",
  user: "User",
};

const effectLabels: Record<Effect, string> = {
  allow: "Allow",
  deny: "Deny",
};

const usersById = new Map(USERS.map((user) => [user.id, user]));
const groupsById = new Map(GROUPS.map((group) => [group.id, group]));
const resourcesById = new Map(
  RESOURCES.map((resource) => [resource.id, resource]),
);
const actionsById = new Map(ACTIONS.map((action) => [action.id, action]));

function cloneInitialRules(): PermissionRule[] {
  return INITIAL_RULES.map((rule) => ({ ...rule }));
}

function validSubjects(subjectType: SubjectType) {
  if (subjectType === "everyone") {
    return [{ id: "everyone" as const, label: "Everyone" }];
  }
  if (subjectType === "group") return GROUPS;
  return USERS;
}

function subjectLabel(rule: PermissionRule): string {
  if (rule.subjectType === "everyone") return "Everyone";
  if (rule.subjectType === "group") {
    return groupsById.get(rule.subjectId as GroupId)?.label ?? rule.subjectId;
  }
  return usersById.get(rule.subjectId as UserId)?.label ?? rule.subjectId;
}

interface RuleRowProps {
  rule: PermissionRule;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

function RuleRow({ rule, onToggle, onDelete }: RuleRowProps) {
  const resource = resourcesById.get(rule.resourceId)?.label ?? rule.resourceId;
  const action = actionsById.get(rule.action)?.label ?? rule.action;

  return (
    <li className={`rule-card ${rule.enabled ? "" : "rule-card--disabled"}`}>
      <div className="rule-card__topline">
        <code className="rule-id">{rule.id}</code>
        <span className={`effect effect--${rule.effect}`}>
          {effectLabels[rule.effect]}
        </span>
      </div>
      <p className="rule-summary">
        <strong>{subjectLabel(rule)}</strong> can {action.toLowerCase()}{" "}
        {resource}
        {rule.appliesToDescendants ? " and its descendants" : " only"}.
      </p>
      <dl className="rule-facts">
        <div>
          <dt>Subject</dt>
          <dd>
            {subjectLabel(rule)} ({subjectTypeLabels[rule.subjectType]})
          </dd>
        </div>
        <div>
          <dt>Resource</dt>
          <dd>{resource}</dd>
        </div>
        <div>
          <dt>Permission</dt>
          <dd>{action}</dd>
        </div>
        <div>
          <dt>Scope</dt>
          <dd>
            {rule.appliesToDescendants
              ? "Includes descendants"
              : "Exact resource"}
          </dd>
        </div>
      </dl>
      <div className="rule-actions">
        <label className="switch-control">
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={() => onToggle(rule.id)}
            aria-label={`Enable ${rule.id}`}
          />
          <span>{rule.enabled ? "Enabled" : "Disabled"}</span>
        </label>
        <button
          className="button button--danger"
          type="button"
          onClick={() => onDelete(rule.id)}
          aria-label={`Delete ${rule.id}`}
        >
          Delete
        </button>
      </div>
    </li>
  );
}

interface AddRuleFormProps {
  onAdd: (rule: Omit<PermissionRule, "id" | "enabled">) => void;
}

function AddRuleForm({ onAdd }: AddRuleFormProps) {
  const [subjectType, setSubjectType] = useState<SubjectType>("everyone");
  const [subjectId, setSubjectId] = useState<SubjectId>("everyone");
  const [resourceId, setResourceId] = useState<ResourceId>("workspace");
  const [action, setAction] = useState<Action>("view");
  const [effect, setEffect] = useState<Effect>("allow");
  const [appliesToDescendants, setAppliesToDescendants] = useState(false);
  const subjects = validSubjects(subjectType);

  function handleSubjectTypeChange(nextType: SubjectType) {
    const nextSubjects = validSubjects(nextType);
    setSubjectType(nextType);
    setSubjectId(nextSubjects[0].id);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAdd({
      subjectType,
      subjectId,
      resourceId,
      action,
      effect,
      appliesToDescendants,
    });
  }

  return (
    <form className="add-rule" onSubmit={handleSubmit}>
      <div className="subheading-row">
        <div>
          <p className="eyebrow">Policy editor</p>
          <h3>Add a rule</h3>
        </div>
        <p className="helper">New rules are enabled automatically.</p>
      </div>
      <div className="form-grid">
        <label>
          <span>Subject type</span>
          <select
            value={subjectType}
            onChange={(event) =>
              handleSubjectTypeChange(event.target.value as SubjectType)
            }
          >
            {(Object.keys(subjectTypeLabels) as SubjectType[]).map((type) => (
              <option key={type} value={type}>
                {subjectTypeLabels[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Subject</span>
          <select
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value as SubjectId)}
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.label}
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
          <span>Action</span>
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
        <label>
          <span>Effect</span>
          <select
            value={effect}
            onChange={(event) => setEffect(event.target.value as Effect)}
          >
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </select>
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={appliesToDescendants}
            onChange={(event) => setAppliesToDescendants(event.target.checked)}
          />
          <span>Apply to descendants</span>
        </label>
      </div>
      <button className="button button--primary" type="submit">
        Add rule
      </button>
    </form>
  );
}

interface CheckerProps {
  rules: readonly PermissionRule[];
}

function AccessChecker({ rules }: CheckerProps) {
  const [userId, setUserId] = useState<UserId>("ben");
  const [resourceId, setResourceId] = useState<ResourceId>("runbook");
  const [action, setAction] = useState<Action>("edit");
  const result = evaluatePermission(rules, userId, resourceId, action);
  const user = usersById.get(userId)?.label ?? userId;
  const resource = resourcesById.get(resourceId)?.label ?? resourceId;
  const permission = actionsById.get(action)?.label ?? action;

  return (
    <section className="panel checker" aria-labelledby="checker-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Ask the policy</p>
          <h2 id="checker-heading">Check access</h2>
        </div>
        <p>Change any field to recalculate immediately.</p>
      </div>
      <div className="checker-grid">
        <label>
          <span>User</span>
          <select
            value={userId}
            onChange={(event) => setUserId(event.target.value as UserId)}
          >
            {USERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
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
            {RESOURCES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
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
        className={`decision decision--${result.allowed ? "allowed" : "denied"}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="decision__mark" aria-hidden="true">
          {result.allowed ? "✓" : "×"}
        </div>
        <div>
          <p className="decision__title">
            {result.allowed ? "Allowed" : "Denied"}
          </p>
          <p className="decision__query">
            {user} · {resource} · {permission}
          </p>
          <p className="decision__reason">{result.reason}</p>
        </div>
      </div>
    </section>
  );
}

function PermissionsMatrix({ rules }: CheckerProps) {
  const matrix = useMemo(
    () =>
      USERS.map((user) => ({
        user,
        cells: RESOURCES.flatMap((resource) =>
          ACTIONS.map((action) => ({
            resource,
            action,
            result: evaluatePermission(rules, user.id, resource.id, action.id),
          })),
        ),
      })),
    [rules],
  );

  return (
    <section className="panel matrix-panel" aria-labelledby="matrix-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">All 36 decisions</p>
          <h2 id="matrix-heading">Effective permissions</h2>
        </div>
        <p>Closer resources win first, then more specific subjects.</p>
      </div>
      <div
        className="table-scroll"
        tabIndex={0}
        aria-label="Scrollable permissions matrix"
      >
        <table>
          <caption className="sr-only">
            Effective permission for every user, resource, and action
          </caption>
          <thead>
            <tr>
              <th rowSpan={2} scope="col" className="sticky-column">
                User
              </th>
              {RESOURCES.map((resource) => (
                <th key={resource.id} scope="colgroup" colSpan={ACTIONS.length}>
                  {resource.label}
                </th>
              ))}
            </tr>
            <tr>
              {RESOURCES.flatMap((resource) =>
                ACTIONS.map((action) => (
                  <th key={`${resource.id}-${action.id}`} scope="col">
                    {action.label}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {matrix.map(({ user, cells }) => (
              <tr key={user.id}>
                <th scope="row" className="sticky-column">
                  {user.label}
                </th>
                {cells.map(({ resource, action, result }) => {
                  const status = result.allowed ? "Allowed" : "Denied";
                  return (
                    <td key={`${resource.id}-${action.id}`}>
                      <span
                        className={`matrix-status matrix-status--${result.allowed ? "allowed" : "denied"}`}
                        aria-label={`${user.label}, ${resource.label}, ${action.label}: ${status}`}
                        title={result.reason}
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
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function PermissionsPlayground() {
  const [rules, setRules] = useState<PermissionRule[]>(cloneInitialRules);
  const nextRuleNumber = useRef(8);

  function toggleRule(id: string) {
    setRules((current) =>
      current.map((rule) =>
        rule.id === id ? { ...rule, enabled: !rule.enabled } : rule,
      ),
    );
  }

  function deleteRule(id: string) {
    setRules((current) => current.filter((rule) => rule.id !== id));
  }

  function resetPolicy() {
    nextRuleNumber.current = 8;
    setRules(cloneInitialRules());
  }

  function addRule(rule: Omit<PermissionRule, "id" | "enabled">) {
    const id = `rule-${nextRuleNumber.current}`;
    nextRuleNumber.current += 1;
    setRules((current) => [...current, { ...rule, id, enabled: true }]);
  }

  return (
    <main>
      <header className="hero">
        <div className="hero__content">
          <p className="eyebrow">Local policy sandbox</p>
          <h1>Permissions Playground</h1>
          <p className="hero__lede">
            Explore how resource distance, subject specificity, and explicit
            denies combine—without sending policy data anywhere.
          </p>
        </div>
        <div className="priority-key" aria-label="Permission evaluation order">
          <span>1 · Closest resource</span>
          <span>2 · Specific subject</span>
          <span>3 · Deny breaks ties</span>
        </div>
      </header>

      <div className="page-shell">
        <section className="panel rules-panel" aria-labelledby="rules-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Editable fixture</p>
              <h2 id="rules-heading">Policy rules</h2>
            </div>
            <button
              className="button button--secondary"
              type="button"
              onClick={resetPolicy}
            >
              Reset policy
            </button>
          </div>
          <p className="section-intro">
            {rules.length} {rules.length === 1 ? "rule" : "rules"}. Disabled
            rules stay visible but do not participate.
          </p>
          {rules.length > 0 ? (
            <ul className="rules-list">
              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  onToggle={toggleRule}
                  onDelete={deleteRule}
                />
              ))}
            </ul>
          ) : (
            <div className="empty-state">
              <p>
                <strong>No policy rules.</strong>
              </p>
              <p>Every permission is denied by default until you add one.</p>
            </div>
          )}
          <AddRuleForm onAdd={addRule} />
        </section>

        <AccessChecker rules={rules} />
        <PermissionsMatrix rules={rules} />
      </div>
      <footer>
        Educational evaluator only · Local in-memory state · Default deny
      </footer>
    </main>
  );
}
