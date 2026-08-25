// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({ createSpecialtyAction: vi.fn(), updateSpecialtyAction: vi.fn() }));

import { SpecialtyList } from "./specialty-list";

describe("SpecialtyList", () => {
  it("opens add and custom edit dialogs while keeping global specialties read-only", async () => {
    const user = userEvent.setup();
    render(<SpecialtyList actingBranchId="21000000-0000-4000-8000-000000000001" specialties={[{ specialtyId: "31000000-0000-4000-8000-000000000001", code: "GENERAL", name: "General Dentistry", isGlobal: true, isActive: true, version: 1 }, { specialtyId: "31000000-0000-4000-8000-000000000002", code: "CUSTOM", name: "Custom Specialty", isGlobal: false, isActive: true, version: 1 }]} />);

    expect(screen.getByRole("button", { name: "Add custom specialty" })).toHaveClass("h-11");
    expect(screen.getAllByRole("button", { name: "Edit specialty Custom Specialty" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Edit specialty General Dentistry" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add custom specialty" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Add custom specialty");
    await user.keyboard("{Escape}");
    await user.click(screen.getAllByRole("button", { name: "Edit specialty Custom Specialty" })[0]);
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Edit Custom Specialty");
  });
});
