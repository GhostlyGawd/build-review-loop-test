import { describe, expect, it } from "vitest";
import { evaluatePermission } from "../../src/permissions/evaluate";
import {
  ACTIONS,
  GROUPS,
  INITIAL_RULES,
  RESOURCES,
  USERS,
} from "../../src/permissions/model";
import type { PermissionRule } from "../../src/permissions/model";

describe("frozen domain and evaluator contract", () => {
  it("exports the exact closed domain and initial rule order", () => {
    expect(USERS).toEqual([
      { id: "ada", label: "Ada", groupIds: ["engineering"] },
      { id: "ben", label: "Ben", groupIds: ["engineering", "security"] },
      { id: "cy", label: "Cy", groupIds: [] },
    ]);
    expect(GROUPS).toEqual([
      { id: "engineering", label: "Engineering" },
      { id: "security", label: "Security" },
    ]);
    expect(RESOURCES).toEqual([
      { id: "workspace", label: "Workspace", parentId: null },
      { id: "atlas", label: "Project Atlas", parentId: "workspace" },
      { id: "runbook", label: "Runbook", parentId: "atlas" },
      { id: "budget", label: "Budget", parentId: "atlas" },
    ]);
    expect(ACTIONS).toEqual([
      { id: "view", label: "View" },
      { id: "edit", label: "Edit" },
      { id: "share", label: "Share" },
    ]);
    expect(INITIAL_RULES.map((rule) => rule.id)).toEqual([
      "rule-1",
      "rule-2",
      "rule-3",
      "rule-4",
      "rule-5",
      "rule-6",
      "rule-7",
    ]);
  });

  it.each([
    ["ada", "runbook", "view", true, ["rule-1"]],
    ["ben", "runbook", "edit", false, ["rule-4"]],
    ["ben", "budget", "share", true, ["rule-3"]],
    ["cy", "budget", "view", true, ["rule-5"]],
    ["cy", "runbook", "edit", false, []],
    ["ada", "runbook", "share", false, []],
  ] as const)(
    "evaluates %s / %s / %s",
    (user, resource, action, allowed, winnerIds) => {
      const result = evaluatePermission(INITIAL_RULES, user, resource, action);
      expect(result.allowed).toBe(allowed);
      expect(result.winnerIds).toEqual(winnerIds);
      if (winnerIds.length === 0) {
        expect(result.reason).toBe("No matching rule; default deny.");
      }
    },
  );

  it("filters disabled rules and applies exact-resource specificity", () => {
    const withoutCyAllow = INITIAL_RULES.map((rule) =>
      rule.id === "rule-5" ? { ...rule, enabled: false } : rule,
    );
    expect(
      evaluatePermission(withoutCyAllow, "cy", "budget", "view"),
    ).toMatchObject({
      allowed: false,
      winnerIds: ["rule-6"],
    });
  });

  it("uses closest resource before subject specificity", () => {
    const exactEveryoneDeny: PermissionRule = {
      id: "rule-8",
      subjectType: "everyone",
      subjectId: "everyone",
      resourceId: "runbook",
      action: "view",
      effect: "deny",
      appliesToDescendants: false,
      enabled: true,
    };
    expect(
      evaluatePermission(
        [...INITIAL_RULES, exactEveryoneDeny],
        "ada",
        "runbook",
        "view",
      ),
    ).toMatchObject({
      allowed: false,
      winnerIds: ["rule-8"],
    });
  });

  it("uses deny within a tied tier and sorts all winner IDs", () => {
    const tiedRules: PermissionRule[] = [
      {
        id: "z-allow",
        subjectType: "user",
        subjectId: "ada",
        resourceId: "atlas",
        action: "edit",
        effect: "allow",
        appliesToDescendants: true,
        enabled: true,
      },
      {
        id: "a-deny",
        subjectType: "user",
        subjectId: "ada",
        resourceId: "atlas",
        action: "edit",
        effect: "deny",
        appliesToDescendants: true,
        enabled: true,
      },
    ];
    expect(
      evaluatePermission(tiedRules, "ada", "runbook", "edit"),
    ).toMatchObject({
      allowed: false,
      winnerIds: ["a-deny", "z-allow"],
    });
  });

  it("does not mutate the supplied rule list", () => {
    const rules = structuredClone(INITIAL_RULES) as PermissionRule[];
    const before = structuredClone(rules);
    evaluatePermission(rules, "ben", "runbook", "edit");
    expect(rules).toEqual(before);
  });
});
