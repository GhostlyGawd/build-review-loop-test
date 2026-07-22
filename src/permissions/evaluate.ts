import { RESOURCES, USERS } from "./model";
import type {
  Action,
  EvaluationResult,
  GroupId,
  PermissionRule,
  ResourceId,
  SubjectType,
  UserId,
} from "./model";

interface RankedRule {
  rule: PermissionRule;
  resourceDistance: number;
  subjectSpecificity: number;
}

function getUser(userId: UserId) {
  const user = USERS.find((candidate) => candidate.id === userId);
  if (!user) {
    throw new Error(`Unknown user: ${userId}`);
  }
  return user;
}

function getResource(resourceId: ResourceId) {
  const resource = RESOURCES.find((candidate) => candidate.id === resourceId);
  if (!resource) {
    throw new Error(`Unknown resource: ${resourceId}`);
  }
  return resource;
}

function subjectMatches(rule: PermissionRule, userId: UserId): boolean {
  if (rule.subjectType === "everyone") {
    return true;
  }

  if (rule.subjectType === "user") {
    return rule.subjectId === userId;
  }

  return getUser(userId).groupIds.includes(rule.subjectId as GroupId);
}

function resourceDistanceForRule(
  rule: PermissionRule,
  resourceId: ResourceId,
): number | null {
  if (rule.resourceId === resourceId) {
    return 0;
  }

  if (!rule.appliesToDescendants) {
    return null;
  }

  let distance = 1;
  let current = getResource(resourceId).parentId;

  while (current) {
    if (current === rule.resourceId) {
      return distance;
    }
    current = getResource(current).parentId;
    distance += 1;
  }

  return null;
}

function subjectSpecificity(subjectType: SubjectType): number {
  switch (subjectType) {
    case "user":
      return 3;
    case "group":
      return 2;
    case "everyone":
      return 1;
    default:
      return 0;
  }
}

function matchingRules(
  rules: readonly PermissionRule[],
  userId: UserId,
  resourceId: ResourceId,
  action: Action,
): RankedRule[] {
  const matches: RankedRule[] = [];

  for (const rule of rules) {
    if (!rule.enabled || rule.action !== action) {
      continue;
    }

    if (!subjectMatches(rule, userId)) {
      continue;
    }

    const distance = resourceDistanceForRule(rule, resourceId);
    if (distance === null) {
      continue;
    }

    matches.push({
      rule,
      resourceDistance: distance,
      subjectSpecificity: subjectSpecificity(rule.subjectType),
    });
  }

  return matches;
}

export function evaluatePermission(
  rules: readonly PermissionRule[],
  userId: UserId,
  resourceId: ResourceId,
  action: Action,
): EvaluationResult {
  const matches = matchingRules(rules, userId, resourceId, action);

  if (matches.length === 0) {
    return {
      allowed: false,
      winnerIds: [],
      reason: "No matching rule; default deny.",
    };
  }

  const closestDistance = Math.min(
    ...matches.map((match) => match.resourceDistance),
  );
  const closestMatches = matches.filter(
    (match) => match.resourceDistance === closestDistance,
  );

  const highestSpecificity = Math.max(
    ...closestMatches.map((match) => match.subjectSpecificity),
  );
  const winningTier = closestMatches.filter(
    (match) => match.subjectSpecificity === highestSpecificity,
  );

  const winnerIds = winningTier
    .map((match) => match.rule.id)
    .sort((left, right) => left.localeCompare(right));
  const allowed = !winningTier.some((match) => match.rule.effect === "deny");

  return {
    allowed,
    winnerIds,
    reason: `${allowed ? "Allowed" : "Denied"} by winning rule${winnerIds.length === 1 ? "" : "s"}: ${winnerIds.join(", ")}.`,
  };
}
