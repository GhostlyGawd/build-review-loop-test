import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import PermissionsPlayground from "../src/PermissionsPlayground";

describe("Permissions Playground state integrity", () => {
  it("constrains subject choices and resets each type to its first value", async () => {
    const user = userEvent.setup();
    render(<PermissionsPlayground />);
    const rules = screen.getByRole("region", { name: "Policy rules" });
    const type = within(rules).getByLabelText("Subject type");
    const subject = within(rules).getByLabelText("Subject");

    expect(subject).toHaveValue("everyone");
    expect(within(subject).getAllByRole("option")).toHaveLength(1);

    await user.selectOptions(type, "group");
    expect(subject).toHaveValue("engineering");
    expect(
      within(subject)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Engineering", "Security"]);

    await user.selectOptions(subject, "security");
    await user.selectOptions(type, "user");
    expect(subject).toHaveValue("ada");
    expect(within(subject).getAllByRole("option")).toHaveLength(3);
  });

  it("never reuses deleted IDs before reset and restarts at rule-8 after reset", async () => {
    const user = userEvent.setup();
    render(<PermissionsPlayground />);

    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(
      screen.getByRole("checkbox", { name: "Enable rule-8" }),
    ).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Delete rule-8" }));
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(
      screen.getByRole("checkbox", { name: "Enable rule-9" }),
    ).toBeChecked();

    await user.click(screen.getByRole("button", { name: "Reset policy" }));
    expect(
      screen.queryByRole("checkbox", { name: "Enable rule-9" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    expect(
      screen.getByRole("checkbox", { name: "Enable rule-8" }),
    ).toBeChecked();
  });

  it("updates the matrix when a disabled rule is enabled", async () => {
    const user = userEvent.setup();
    render(<PermissionsPlayground />);
    const matrix = screen.getByRole("region", {
      name: "Effective permissions",
    });

    expect(
      within(matrix).getByLabelText("Ada, Runbook, Share: Denied"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Enable rule-7" }));
    expect(
      within(matrix).getByLabelText("Ada, Runbook, Share: Allowed"),
    ).toBeInTheDocument();
  });

  it("handles deleting the final rule with a truthful default-deny status", async () => {
    const user = userEvent.setup();
    render(<PermissionsPlayground />);

    for (const button of screen.getAllByRole("button", {
      name: /Delete rule-/,
    })) {
      await user.click(button);
    }

    expect(screen.getByText("No policy rules.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Denied");
    expect(screen.getByRole("status")).toHaveTextContent(
      "No matching rule; default deny.",
    );
    expect(
      screen.getByLabelText("Ben, Runbook, Edit: Denied"),
    ).toBeInTheDocument();
  });

  it("keeps one h1, a live status, and all behavior local", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    render(<PermissionsPlayground />);

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
    await user.click(screen.getByRole("button", { name: "Add rule" }));
    await user.click(screen.getByRole("checkbox", { name: "Enable rule-1" }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
