// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({
  loadInventoryAction: vi.fn(), listMovementsAction: vi.fn(), createItemAction: vi.fn(), updateItemAction: vi.fn(), receiveStockAction: vi.fn(), adjustStockAction: vi.fn(), issueStockAction: vi.fn(), createTransferAction: vi.fn(), confirmTransferAction: vi.fn(), cancelTransferAction: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn() }));
vi.mock("./actions", () => actions);
vi.mock("sonner", () => ({ toast }));

import { InventoryBoard } from "./inventory-board";
import type { InventoryAggregate, InventoryItem, InventoryStockRow, InventoryTransfer } from "@/lib/inventory/types";

const branchId = "d1000000-0000-0000-0000-000000000001";
const destinationBranchId = "d1000000-0000-0000-0000-000000000002";
const itemId = "d2000000-0000-0000-0000-000000000001";
const transferId = "d3000000-0000-0000-0000-000000000001";
const branches = [{ id: branchId, name: "Main" }, { id: destinationBranchId, name: "North" }];
const item: InventoryItem = { itemId, code: "GLOVES", name: "Exam gloves", category: "CONSUMABLE", unit: "box", reorderLevel: 5, lotTracking: true, isActive: true, version: 1 };
const stock: InventoryStockRow = { itemId, itemCode: "GLOVES", itemName: "Exam gloves", branchId, quantityOnHand: 2, reorderLevelOverride: null, reorderLevel: 5, lowStock: true, version: 1 };
const aggregate: InventoryAggregate = { itemId, itemCode: "GLOVES", itemName: "Exam gloves", totalOnHand: 8, branches: [{ branchId, quantity: 2, low: true }, { branchId: destinationBranchId, quantity: 6, low: false }] };
const transfer: InventoryTransfer = { transferId, itemId, itemCode: "GLOVES", itemName: "Exam gloves", sourceBranchId: branchId, destinationBranchId, quantity: 2, status: "SENT", reason: "Rebalance", confirmedAt: null, version: 1, createdAt: "2026-08-27T10:00:00+00:00" };

function renderBoard(overrides: Partial<React.ComponentProps<typeof InventoryBoard>> = {}) {
  return render(<InventoryBoard actingBranchId={branchId} branches={branches} canManage initialItems={[item]} initialStock={[stock]} initialAggregate={[aggregate]} initialTransfers={[transfer]} {...overrides} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  actions.loadInventoryAction.mockResolvedValue({ ok: true, items: [item], stock: [stock], aggregate: [aggregate], transfers: [transfer] });
  actions.listMovementsAction.mockResolvedValue({ ok: true, movements: [{ movementId: "d4000000-0000-0000-0000-000000000001", itemId, itemCode: "GLOVES", movementType: "RECEIPT", quantityDelta: 10, reason: null, transferId: null, lotNumber: "LOT-1", expiryDate: "2027-01-31", recordedBy: null, recordedAt: "2026-08-27T10:00:00+00:00" }] });
  for (const name of ["createItemAction", "updateItemAction", "receiveStockAction", "adjustStockAction", "issueStockAction", "createTransferAction", "confirmTransferAction", "cancelTransferAction"] as const) actions[name].mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("InventoryBoard", () => {
  it("renders dense desktop and phone stock views with low-stock emphasis", () => {
    const { container } = renderBoard();
    expect(screen.getByRole("table", { name: "Branch stock balances" })).toBeInTheDocument();
    expect(screen.getByLabelText("Branch stock list")).toBeInTheDocument();
    expect(screen.getByLabelText("Inventory item catalog list")).toBeInTheDocument();
    expect(screen.getByLabelText("Inventory transfer list")).toBeInTheDocument();
    expect(screen.getAllByText("Exam gloves").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Low stock").length).toBeGreaterThan(0);
    expect(Array.from(container.querySelectorAll("tr")).some((row) => row.classList.contains("bg-destructive/5"))).toBe(true);
  });

  it("hides every mutation control without inventory.manage", () => {
    renderBoard({ canManage: false });
    expect(screen.queryByRole("button", { name: "New item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Receive" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Adjust" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Issue" })).not.toBeInTheDocument();
  });

  it("keeps primary and row actions at least 44px high", () => {
    renderBoard();
    for (const name of ["New item", "New transfer", "Receive", "Adjust", "Issue"]) {
      expect(screen.getAllByRole("button", { name })[0]).toHaveClass("min-h-11");
    }
  });

  it("requires a reason before adjustment and issue actions", async () => {
    renderBoard();
    fireEvent.click(screen.getAllByRole("button", { name: "Adjust" })[0]);
    fireEvent.change(screen.getByLabelText("Quantity change"), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply adjustment" }));
    expect(await screen.findByText("Add a reason for this stock change.")).toBeInTheDocument();
    expect(actions.adjustStockAction).not.toHaveBeenCalled();
  });

  it("issues stock and surfaces insufficient-stock errors", async () => {
    actions.issueStockAction.mockResolvedValueOnce({ ok: false, message: "Not enough stock on hand." });
    renderBoard();
    fireEvent.click(screen.getAllByRole("button", { name: "Issue" })[0]);
    fireEvent.change(screen.getByLabelText("Quantity"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Treatment room" } });
    fireEvent.click(screen.getByRole("button", { name: "Issue stock" }));
    expect(await screen.findByText("Not enough stock on hand.")).toBeInTheDocument();
  });

  it("shows confirm receipt only when the acting branch is the destination", () => {
    const { rerender } = renderBoard();
    expect(screen.queryByRole("button", { name: "Confirm receipt" })).not.toBeInTheDocument();
    rerender(<InventoryBoard actingBranchId={destinationBranchId} branches={branches} canManage initialItems={[item]} initialStock={[]} initialAggregate={[aggregate]} initialTransfers={[transfer]} />);
    expect(screen.getAllByRole("button", { name: "Confirm receipt" }).length).toBeGreaterThan(0);
  });

  it("confirms destination receipt with the version-bound transfer identity", async () => {
    renderBoard({ actingBranchId: destinationBranchId, initialStock: [] });
    fireEvent.click(screen.getAllByRole("button", { name: "Confirm receipt" })[0]);
    await waitFor(() => expect(actions.confirmTransferAction).toHaveBeenCalledWith({ actingBranchId: destinationBranchId, transferId, expectedVersion: 1 }));
  });

  it("loads movement history and renders aggregate branch breakdown", async () => {
    renderBoard();
    expect(screen.getByText("Organization stock by branch")).toBeInTheDocument();
    expect(screen.getByText(/Main: 2/)).toBeInTheDocument();
    expect(screen.getByText(/North: 6/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load movement history" }));
    expect(await screen.findByText(/LOT-1/)).toBeInTheDocument();
    expect(actions.listMovementsAction).toHaveBeenCalledWith({ actingBranchId: branchId, itemId: null });
  });
});
