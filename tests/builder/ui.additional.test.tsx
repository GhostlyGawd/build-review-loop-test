import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import PermissionsPlayground from "../../src/PermissionsPlayground";

describe("Permissions Playground interaction regressions", () => {
  it("constrains subject values when the subject type changes", async () => {
    const user = userEvent.setup();
    render(<PermissionsPlayground />);
    const rules = screen.getByRole("region", { name: "Policy rules" });
    const subjectType = within(rules).getByLabelText("Subject type");
    const subject = within(rules).getByLabelText("Subject");

    expect(subject).toHaveValue("everyone");
    await user.selectOptions(subjectType, "group");
    expect(subject).toHaveValue("engineering");
    expect(within(subject).getAllByRole("option")).toHaveLength(2);
    await user.selectOptions(subjectType, "user");
    expect(subject).toHaveValue("ada");
    expect(within(subject).getAllByRole("option")).toHaveLength(3);
  });

  it("does not reuse deleted IDs and reset restores rule-8", async () => {
    const user = userEvent.setup();
    render(<PermissionsPlayground />);

    await user.click(screen.getByRole("button", { name: "Add rule" }));
    await user.click(screen.getByRole("button", { name: "Delete rule-8" }));
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(
      screen.getByRole("checkbox", { name: "Enable rule-9" }),
    ).toBeChecked();
    expect(
      screen.queryByRole("checkbox", { name: "Enable rule-8" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reset policy" }));
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(
      screen.getByRole("checkbox", { name: "Enable rule-8" }),
    ).toBeChecked();
  });

  it("updates checker and accessible matrix status when a disabled rule is enabled", async () => {
    const user = userEvent.setup();
    render(<PermissionsPlayground />);
    const checker = screen.getByRole("region", { name: "Check access" });
    const matrix = screen.getByRole("region", {
      name: "Effective permissions",
    });

    await user.selectOptions(within(checker).getByLabelText("User"), "ada");
    await user.selectOptions(
      within(checker).getByLabelText("Permission"),
      "share",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Denied");
    expect(
      within(matrix).getByLabelText(/Ada.*Runbook.*Share.*Denied$/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Enable rule-7" }));
    expect(screen.getByRole("status")).toHaveTextContent("Allowed");
    expect(screen.getByRole("status")).toHaveTextContent("rule-7");
    expect(
      within(matrix).getByLabelText(/Ada.*Runbook.*Share.*Allowed$/),
    ).toBeInTheDocument();
  });

  it("preserves one top-level heading and a named live status", () => {
    render(<PermissionsPlayground />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
