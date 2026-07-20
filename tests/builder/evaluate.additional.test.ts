import { describe, expect, it } from "vitest";
import { evaluatePermission } from "../../src/permissions/evaluate";
import {
  INITIAL_RULES,
  type PermissionRule,
} from "../../src/permissions/model";

describe("evaluator regression coverage", () => {
  it("lets a closer everyone rule outrank a broader user rule", () => {
    const rules: PermissionRule[] = [
      {
        id: "broad-user-allow",
        subjectType: "user",
        subjectId: "ada",
        resourceId: "workspace",
        action: "edit",
        effect: "allow",
        appliesToDescendants: true,
        enabled: true,
      },
      {
        id: "close-everyone-deny",
        subjectType: "everyone",
        subjectId: "everyone",
        resourceId: "atlas",
        action: "edit",
        effect: "deny",
        appliesToDescendants: true,
        enabled: true,
      },
    ];

    expect(evaluatePermission(rules, "ada", "runbook", "edit")).toEqual({
      allowed: false,
      winnerIds: ["close-everyone-deny"],
      reason: "Denied by winning rule: close-everyone-deny.",
    });
  });

  it("keeps all equally specific winners and denies a mixed-effect tie", () => {
    const rules: PermissionRule[] = [
      {
        id: "z-allow",
        subjectType: "group",
        subjectId: "engineering",
        resourceId: "atlas",
        action: "share",
        effect: "allow",
        appliesToDescendants: true,
        enabled: true,
      },
      {
        id: "a-deny",
        subjectType: "group",
        subjectId: "security",
        resourceId: "atlas",
        action: "share",
        effect: "deny",
        appliesToDescendants: true,
        enabled: true,
      },
    ];

    expect(evaluatePermission(rules, "ben", "budget", "share")).toEqual({
      allowed: false,
      winnerIds: ["a-deny", "z-allow"],
      reason: "Denied by winning rules: a-deny, z-allow.",
    });
  });

  it("fails closed for duplicate IDs or malformed runtime input", () => {
    const duplicateIds = [
      INITIAL_RULES[0],
      { ...INITIAL_RULES[1], id: INITIAL_RULES[0]?.id ?? "rule-1" },
    ] as PermissionRule[];
    const malformed = [
      { ...INITIAL_RULES[0], subjectType: "user", subjectId: "everyone" },
    ] as PermissionRule[];

    expect(
      evaluatePermission(duplicateIds, "ada", "workspace", "view"),
    ).toEqual({
      allowed: false,
      winnerIds: [],
      reason: "Invalid policy; access denied.",
    });
    expect(evaluatePermission(malformed, "ada", "workspace", "view")).toEqual({
      allowed: false,
      winnerIds: [],
      reason: "Invalid policy; access denied.",
    });
  });

  it("ignores disabled matching rules and defaults to deny with no winners", () => {
    const disabled = INITIAL_RULES.map((rule) => ({ ...rule, enabled: false }));
    expect(evaluatePermission(disabled, "ben", "budget", "share")).toEqual({
      allowed: false,
      winnerIds: [],
      reason: "No matching rule; default deny.",
    });
  });
});
