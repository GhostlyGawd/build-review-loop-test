import {
  ACTIONS,
  GROUPS,
  RESOURCES,
  USERS,
  type Action,
  type EvaluationResult,
  type PermissionRule,
  type ResourceId,
  type UserId,
} from "./model";

const DEFAULT_DENY = "No matching rule; default deny.";
const INVALID_QUERY = "Invalid permission query; default deny.";
const INVALID_POLICY = "Invalid policy; default deny.";

const userIds = new Set<string>(USERS.map(({ id }) => id));
const groupIds = new Set<string>(GROUPS.map(({ id }) => id));
const resourceIds = new Set<string>(RESOURCES.map(({ id }) => id));
const actionIds = new Set<string>(ACTIONS.map(({ id }) => id));

const parentByResource = new Map<ResourceId, ResourceId | null>(
  RESOURCES.map(({ id, parentId }) => [id, parentId]),
);

function isValidSubject(rule: PermissionRule): boolean {
  if (rule.subjectType === "everyone") return rule.subjectId === "everyone";
  if (rule.subjectType === "group") return groupIds.has(rule.subjectId);
  if (rule.subjectType === "user") return userIds.has(rule.subjectId);
  return false;
}

function isValidRule(value: unknown): value is PermissionRule {
  if (typeof value !== "object" || value === null) return false;
  const rule = value as PermissionRule;
  return (
    typeof rule.id === "string" &&
    rule.id.length > 0 &&
    isValidSubject(rule) &&
    resourceIds.has(rule.resourceId) &&
    actionIds.has(rule.action) &&
    (rule.effect === "allow" || rule.effect === "deny") &&
    typeof rule.appliesToDescendants === "boolean" &&
    typeof rule.enabled === "boolean"
  );
}

function isValidPolicy(rules: readonly PermissionRule[]): boolean {
  const ids = new Set<string>();
  for (const rule of rules) {
    if (!isValidRule(rule) || ids.has(rule.id)) return false;
    ids.add(rule.id);
  }
  return true;
}

function distanceFromQuery(
  queryResource: ResourceId,
  ruleResource: ResourceId,
  appliesToDescendants: boolean,
): number | null {
  if (queryResource === ruleResource) return 0;
  if (!appliesToDescendants) return null;

  let distance = 0;
  let current: ResourceId | null = queryResource;
  while (current !== null) {
    if (current === ruleResource) return distance;
    current = parentByResource.get(current) ?? null;
    distance += 1;
  }
  return null;
}

function subjectSpecificity(
  rule: PermissionRule,
  userId: UserId,
): number | null {
  if (rule.subjectType === "everyone") return 1;
  if (rule.subjectType === "user") {
    return rule.subjectId === userId ? 3 : null;
  }
  const user = USERS.find(({ id }) => id === userId);
  return user?.groupIds.some((groupId) => groupId === rule.subjectId)
    ? 2
    : null;
}

export function evaluatePermission(
  rules: readonly PermissionRule[],
  userId: UserId,
  resourceId: ResourceId,
  action: Action,
): EvaluationResult {
  if (
    !userIds.has(userId) ||
    !resourceIds.has(resourceId) ||
    !actionIds.has(action)
  ) {
    return { allowed: false, winnerIds: [], reason: INVALID_QUERY };
  }
  if (!Array.isArray(rules) || !isValidPolicy(rules)) {
    return { allowed: false, winnerIds: [], reason: INVALID_POLICY };
  }

  const matches: {
    rule: PermissionRule;
    distance: number;
    specificity: number;
  }[] = [];

  for (const rule of rules) {
    if (!rule.enabled || rule.action !== action) continue;
    const distance = distanceFromQuery(
      resourceId,
      rule.resourceId,
      rule.appliesToDescendants,
    );
    const specificity = subjectSpecificity(rule, userId);
    if (distance !== null && specificity !== null) {
      matches.push({ rule, distance, specificity });
    }
  }

  if (matches.length === 0) {
    return { allowed: false, winnerIds: [], reason: DEFAULT_DENY };
  }

  const closestDistance = Math.min(...matches.map(({ distance }) => distance));
  const closestMatches = matches.filter(
    ({ distance }) => distance === closestDistance,
  );
  const highestSpecificity = Math.max(
    ...closestMatches.map(({ specificity }) => specificity),
  );
  const winners = closestMatches.filter(
    ({ specificity }) => specificity === highestSpecificity,
  );
  const winnerIds = winners.map(({ rule }) => rule.id).sort();
  const allowed = winners.every(({ rule }) => rule.effect === "allow");
  const decision = allowed ? "Allowed" : "Denied";

  return {
    allowed,
    winnerIds,
    reason: `${decision} by winning ${winnerIds.length === 1 ? "rule" : "rules"}: ${winnerIds.join(", ")}.`,
  };
}
