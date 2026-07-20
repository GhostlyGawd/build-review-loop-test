export type UserId = "ada" | "ben" | "cy";
export type GroupId = "engineering" | "security";
export type ResourceId = "workspace" | "atlas" | "runbook" | "budget";
export type Action = "view" | "edit" | "share";
export type Effect = "allow" | "deny";
export type SubjectType = "everyone" | "group" | "user";
export type SubjectId = "everyone" | GroupId | UserId;

export interface PermissionRule {
  id: string;
  subjectType: SubjectType;
  subjectId: SubjectId;
  resourceId: ResourceId;
  action: Action;
  effect: Effect;
  appliesToDescendants: boolean;
  enabled: boolean;
}

export interface EvaluationResult {
  allowed: boolean;
  winnerIds: string[];
  reason: string;
}

export const USERS = [
  { id: "ada", label: "Ada", groupIds: ["engineering"] },
  { id: "ben", label: "Ben", groupIds: ["engineering", "security"] },
  { id: "cy", label: "Cy", groupIds: [] },
] as const satisfies readonly {
  id: UserId;
  label: string;
  groupIds: readonly GroupId[];
}[];

export const GROUPS = [
  { id: "engineering", label: "Engineering" },
  { id: "security", label: "Security" },
] as const satisfies readonly { id: GroupId; label: string }[];

export const RESOURCES = [
  { id: "workspace", label: "Workspace", parentId: null },
  { id: "atlas", label: "Project Atlas", parentId: "workspace" },
  { id: "runbook", label: "Runbook", parentId: "atlas" },
  { id: "budget", label: "Budget", parentId: "atlas" },
] as const satisfies readonly {
  id: ResourceId;
  label: string;
  parentId: ResourceId | null;
}[];

export const ACTIONS = [
  { id: "view", label: "View" },
  { id: "edit", label: "Edit" },
  { id: "share", label: "Share" },
] as const satisfies readonly { id: Action; label: string }[];

export const INITIAL_RULES = [
  {
    id: "rule-1",
    subjectType: "everyone",
    subjectId: "everyone",
    resourceId: "workspace",
    action: "view",
    effect: "allow",
    appliesToDescendants: true,
    enabled: true,
  },
  {
    id: "rule-2",
    subjectType: "group",
    subjectId: "engineering",
    resourceId: "atlas",
    action: "edit",
    effect: "allow",
    appliesToDescendants: true,
    enabled: true,
  },
  {
    id: "rule-3",
    subjectType: "group",
    subjectId: "security",
    resourceId: "atlas",
    action: "share",
    effect: "allow",
    appliesToDescendants: true,
    enabled: true,
  },
  {
    id: "rule-4",
    subjectType: "user",
    subjectId: "ben",
    resourceId: "runbook",
    action: "edit",
    effect: "deny",
    appliesToDescendants: false,
    enabled: true,
  },
  {
    id: "rule-5",
    subjectType: "user",
    subjectId: "cy",
    resourceId: "budget",
    action: "view",
    effect: "allow",
    appliesToDescendants: false,
    enabled: true,
  },
  {
    id: "rule-6",
    subjectType: "everyone",
    subjectId: "everyone",
    resourceId: "budget",
    action: "view",
    effect: "deny",
    appliesToDescendants: false,
    enabled: true,
  },
  {
    id: "rule-7",
    subjectType: "user",
    subjectId: "ada",
    resourceId: "runbook",
    action: "share",
    effect: "allow",
    appliesToDescendants: false,
    enabled: false,
  },
] as const satisfies readonly PermissionRule[];
