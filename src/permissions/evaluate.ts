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

const DEFAULT_DENY_REASON = "No matching rule; default deny.";
const INVALID_POLICY_REASON = "Invalid policy; access denied.";

const userIds = new Set<string>(USERS.map(({ id }) => id));
const groupIds = new Set<string>(GROUPS.map(({ id }) => id));
const resourceIds = new Set<string>(RESOURCES.map(({ id }) => id));
const actionIds = new Set<string>(ACTIONS.map(({ id }) => id));
const effects = new Set(["allow", "deny"]);
const subjectTypes = new Set(["everyone", "group", "user"]);

function isValidRule(rule: PermissionRule): boolean {
  if (
    typeof rule !== "object" ||
    rule === null ||
    typeof rule.id !== "string" ||
    rule.id.trim().length === 0 ||
    !subjectTypes.has(rule.subjectType) ||
    !resourceIds.has(rule.resourceId) ||
    !actionIds.has(rule.action) ||
    !effects.has(rule.effect) ||
    typeof rule.appliesToDescendants !== "boolean" ||
    typeof rule.enabled !== "boolean"
  ) {
    return false;
  }

  if (rule.subjectType === "everyone") return rule.subjectId === "everyone";
  if (rule.subjectType === "group") return groupIds.has(rule.subjectId);
  return userIds.has(rule.subjectId);
}

function distanceFromAncestor(
  ancestorId: ResourceId,
  resourceId: ResourceId,
): number | null {
  let current: ResourceId | null = resourceId;
  let distance = 0;

  while (current !== null) {
    if (current === ancestorId) return distance;
    const resource = RESOURCES.find(({ id }) => id === current);
    current = resource?.parentId ?? null;
    distance += 1;
  }

  return null;
}

function subjectMatches(rule: PermissionRule, userId: UserId): boolean {
  if (rule.subjectType === "everyone") return true;
  if (rule.subjectType === "user") return rule.subjectId === userId;
  const user = USERS.find(({ id }) => id === userId);
  return user?.groupIds.some((groupId) => groupId === rule.subjectId) ?? false;
}

function subjectSpecificity(rule: PermissionRule): number {
  if (rule.subjectType === "user") return 3;
  if (rule.subjectType === "group") return 2;
  return 1;
}

export function evaluatePermission(
  rules: readonly PermissionRule[],
  userId: UserId,
  resourceId: ResourceId,
  action: Action,
): EvaluationResult {
  const ids = new Set<string>();
  const policyIsValid =
    Array.isArray(rules) &&
    rules.every((rule) => {
      if (!isValidRule(rule) || ids.has(rule.id)) return false;
      ids.add(rule.id);
      return true;
    });

  if (
    !policyIsValid ||
    !userIds.has(userId) ||
    !resourceIds.has(resourceId) ||
    !actionIds.has(action)
  ) {
    return { allowed: false, winnerIds: [], reason: INVALID_POLICY_REASON };
  }

  const matches = rules.flatMap((rule) => {
    if (
      !rule.enabled ||
      rule.action !== action ||
      !subjectMatches(rule, userId)
    ) {
      return [];
    }

    const resourceDistance = distanceFromAncestor(rule.resourceId, resourceId);
    if (
      resourceDistance === null ||
      (resourceDistance > 0 && !rule.appliesToDescendants)
    ) {
      return [];
    }

    return [{ rule, resourceDistance, specificity: subjectSpecificity(rule) }];
  });

  if (matches.length === 0) {
    return { allowed: false, winnerIds: [], reason: DEFAULT_DENY_REASON };
  }

  const closestDistance = Math.min(
    ...matches.map(({ resourceDistance }) => resourceDistance),
  );
  const closestMatches = matches.filter(
    ({ resourceDistance }) => resourceDistance === closestDistance,
  );
  const greatestSpecificity = Math.max(
    ...closestMatches.map(({ specificity }) => specificity),
  );
  const winners = closestMatches
    .filter(({ specificity }) => specificity === greatestSpecificity)
    .map(({ rule }) => rule)
    .sort((left, right) => left.id.localeCompare(right.id));
  const allowed = winners.every(({ effect }) => effect === "allow");
  const winnerIds = winners.map(({ id }) => id);
  const decision = allowed ? "Allowed" : "Denied";

  return {
    allowed,
    winnerIds,
    reason: `${decision} by winning ${winnerIds.length === 1 ? "rule" : "rules"}: ${winnerIds.join(", ")}.`,
  };
}
