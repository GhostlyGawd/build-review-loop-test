import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import PermissionsPlayground from "../../src/PermissionsPlayground";

describe("Permissions Playground public UI contract", () => {
  it("renders the three regions, initial query, and complete matrix", () => {
    render(<PermissionsPlayground />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Permissions Playground" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Policy rules" }),
    ).toBeInTheDocument();
    const checker = screen.getByRole("region", { name: "Check access" });
    const matrix = screen.getByRole("region", {
      name: "Effective permissions",
    });

    expect(within(checker).getByLabelText("User")).toHaveValue("ben");
    expect(within(checker).getByLabelText("Resource")).toHaveValue("runbook");
    expect(within(checker).getByLabelText("Permission")).toHaveValue("edit");
    expect(screen.getByRole("status")).toHaveTextContent("Denied");
    expect(screen.getByRole("status")).toHaveTextContent("rule-4");

    const statuses = within(matrix).getAllByLabelText(/(Allowed|Denied)$/);
    expect(statuses).toHaveLength(36);
    expect(
      within(matrix).getByLabelText(/Ada.*Runbook.*View.*Allowed$/),
    ).toBeInTheDocument();
    expect(
      within(matrix).getByLabelText(/Cy.*Runbook.*Edit.*Denied$/),
    ).toBeInTheDocument();
  });

  it("updates results when rules are toggled, deleted, and reset", async () => {
    const user = userEvent.setup();
    render(<PermissionsPlayground />);
    const checker = screen.getByRole("region", { name: "Check access" });

    await user.selectOptions(within(checker).getByLabelText("User"), "cy");
    await user.selectOptions(
      within(checker).getByLabelText("Resource"),
      "budget",
    );
    await user.selectOptions(
      within(checker).getByLabelText("Permission"),
      "view",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Allowed");
    expect(screen.getByRole("status")).toHaveTextContent("rule-5");

    await user.click(screen.getByRole("checkbox", { name: "Enable rule-5" }));
    expect(screen.getByRole("status")).toHaveTextContent("Denied");
    expect(screen.getByRole("status")).toHaveTextContent("rule-6");

    await user.click(screen.getByRole("button", { name: "Delete rule-6" }));
    expect(screen.getByRole("status")).toHaveTextContent("Allowed");
    expect(screen.getByRole("status")).toHaveTextContent("rule-1");

    await user.click(screen.getByRole("button", { name: "Reset policy" }));
    expect(screen.getByRole("status")).toHaveTextContent("Allowed");
    expect(screen.getByRole("status")).toHaveTextContent("rule-5");
  });

  it("adds a constrained rule with the next deterministic ID", async () => {
    const user = userEvent.setup();
    render(<PermissionsPlayground />);
    const rules = screen.getByRole("region", { name: "Policy rules" });
    const checker = screen.getByRole("region", { name: "Check access" });

    await user.selectOptions(
      within(rules).getByLabelText("Subject type"),
      "user",
    );
    await user.selectOptions(within(rules).getByLabelText("Subject"), "ada");
    await user.selectOptions(
      within(rules).getByLabelText("Resource"),
      "runbook",
    );
    await user.selectOptions(within(rules).getByLabelText("Action"), "share");
    await user.selectOptions(within(rules).getByLabelText("Effect"), "allow");
    await user.click(screen.getByRole("button", { name: "Add rule" }));

    expect(
      screen.getByRole("checkbox", { name: "Enable rule-8" }),
    ).toBeChecked();
    await user.selectOptions(within(checker).getByLabelText("User"), "ada");
    await user.selectOptions(
      within(checker).getByLabelText("Resource"),
      "runbook",
    );
    await user.selectOptions(
      within(checker).getByLabelText("Permission"),
      "share",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Allowed");
    expect(screen.getByRole("status")).toHaveTextContent("rule-8");
  });
});
