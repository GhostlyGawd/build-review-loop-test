import { describe, expect, it } from "vitest";
import { evaluatePermission } from "../src/permissions/evaluate";
import { INITIAL_RULES, type PermissionRule } from "../src/permissions/model";

describe("evaluator robustness", () => {
  it("lets resource distance outrank a more specific inherited subject", () => {
    const rules: PermissionRule[] = [
      {
        id: "broad-user-deny",
        subjectType: "user",
        subjectId: "ada",
        resourceId: "workspace",
        action: "view",
        effect: "deny",
        appliesToDescendants: true,
        enabled: true,
      },
      {
        id: "near-everyone-allow",
        subjectType: "everyone",
        subjectId: "everyone",
        resourceId: "atlas",
        action: "view",
        effect: "allow",
        appliesToDescendants: true,
        enabled: true,
      },
    ];

    expect(evaluatePermission(rules, "ada", "runbook", "view")).toEqual({
      allowed: true,
      winnerIds: ["near-everyone-allow"],
      reason: "Allowed by winning rule: near-everyone-allow.",
    });
  });

  it("keeps every tied winner sorted and lets one deny break the tie", () => {
    const rules: PermissionRule[] = [
      {
        id: "z-allow",
        subjectType: "group",
        subjectId: "engineering",
        resourceId: "atlas",
        action: "edit",
        effect: "allow",
        appliesToDescendants: true,
        enabled: true,
      },
      {
        id: "a-deny",
        subjectType: "group",
        subjectId: "security",
        resourceId: "atlas",
        action: "edit",
        effect: "deny",
        appliesToDescendants: true,
        enabled: true,
      },
    ];

    expect(evaluatePermission(rules, "ben", "budget", "edit")).toEqual({
      allowed: false,
      winnerIds: ["a-deny", "z-allow"],
      reason: "Denied by winning rules: a-deny, z-allow.",
    });
  });

  it("fails closed for malformed queries, rules, and duplicate IDs", () => {
    expect(
      evaluatePermission(INITIAL_RULES, "mallory" as "ada", "runbook", "view"),
    ).toMatchObject({ allowed: false, winnerIds: [] });

    const malformed = [
      {
        ...INITIAL_RULES[0],
        effect: "permit",
      },
    ] as unknown as PermissionRule[];
    expect(evaluatePermission(malformed, "ada", "runbook", "view")).toEqual({
      allowed: false,
      winnerIds: [],
      reason: "Invalid policy; default deny.",
    });

    const duplicateIds = [
      { ...INITIAL_RULES[0] },
      { ...INITIAL_RULES[1], id: INITIAL_RULES[0].id },
    ];
    expect(
      evaluatePermission(duplicateIds, "ada", "runbook", "view"),
    ).toMatchObject({ allowed: false, winnerIds: [] });
  });

  it("does not mutate deeply frozen policy input", () => {
    const frozenRules = INITIAL_RULES.map((rule) => Object.freeze({ ...rule }));
    Object.freeze(frozenRules);

    expect(() =>
      evaluatePermission(frozenRules, "ben", "runbook", "edit"),
    ).not.toThrow();
    expect(frozenRules.map(({ id }) => id)).toEqual(
      INITIAL_RULES.map(({ id }) => id),
    );
  });
});
