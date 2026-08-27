import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  AuthorizationError: class AuthorizationError extends Error {},
  InventoryServiceError: class InventoryServiceError extends Error { constructor(public code: string) { super(code); } },
  requirePermission: vi.fn(), revalidatePath: vi.fn(),
  listInventoryItems: vi.fn(), listInventoryStock: vi.fn(), getInventoryAggregate: vi.fn(), listInventoryTransfers: vi.fn(), listInventoryMovements: vi.fn(),
  createInventoryItem: vi.fn(), updateInventoryItem: vi.fn(), receiveStock: vi.fn(), adjustStock: vi.fn(), issueStock: vi.fn(), createInventoryTransfer: vi.fn(), confirmTransferReceipt: vi.fn(), cancelInventoryTransfer: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/authorization", () => ({ AuthorizationError: mocks.AuthorizationError, requirePermission: mocks.requirePermission }));
vi.mock("@/lib/inventory/service", () => mocks);

import { adjustStockAction, cancelTransferAction, confirmTransferAction, createItemAction, createTransferAction, issueStockAction, listMovementsAction, loadInventoryAction, receiveStockAction, updateItemAction } from "./actions";

const branchId = "d1000000-0000-0000-0000-000000000001";
const destinationBranchId = "d1000000-0000-0000-0000-000000000002";
const itemId = "d2000000-0000-0000-0000-000000000001";
const transferId = "d3000000-0000-0000-0000-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requirePermission.mockResolvedValue({});
  mocks.listInventoryItems.mockResolvedValue([]);
  mocks.listInventoryStock.mockResolvedValue([]);
  mocks.getInventoryAggregate.mockResolvedValue([]);
  mocks.listInventoryTransfers.mockResolvedValue([]);
  mocks.listInventoryMovements.mockResolvedValue([]);
});

describe("inventory actions", () => {
  it("reauthorizes inventory.view at the submitted branch before loading", async () => {
    await expect(loadInventoryAction({ actingBranchId: branchId })).resolves.toEqual({ ok: true, items: [], stock: [], aggregate: [], transfers: [] });
    expect(mocks.requirePermission).toHaveBeenCalledWith({ permission: "inventory.view", branchId });
    expect(mocks.requirePermission.mock.invocationCallOrder[0]).toBeLessThan(mocks.listInventoryItems.mock.invocationCallOrder[0]);
  });

  it("rejects forged tenant keys on load before authorization", async () => {
    await expect(loadInventoryAction({ actingBranchId: branchId, organizationId: "foreign" } as never)).resolves.toEqual({ ok: false, message: "The inventory could not be read." });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
  });

  it("creates and updates catalog items under inventory.manage", async () => {
    await expect(createItemAction({ actingBranchId: branchId, code: "GLOVES", name: "Exam gloves", category: "CONSUMABLE", unit: "box", reorderLevel: 5, lotTracking: false })).resolves.toEqual({ ok: true });
    expect(mocks.createInventoryItem).toHaveBeenCalledWith({ actingBranchId: branchId, code: "GLOVES", name: "Exam gloves", category: "CONSUMABLE", unit: "box", reorderLevel: 5, lotTracking: false });
    await expect(updateItemAction({ actingBranchId: branchId, itemId, expectedVersion: 1, name: "Nitrile gloves", category: "CONSUMABLE", unit: "box", reorderLevel: 6, lotTracking: true, isActive: true })).resolves.toEqual({ ok: true });
    expect(mocks.requirePermission).toHaveBeenCalledWith({ permission: "inventory.manage", branchId });
  });

  it("routes receipt, adjustment, and issue with reason-bound validation", async () => {
    await expect(receiveStockAction({ actingBranchId: branchId, itemId, quantity: 10, lotNumber: null, expiryDate: null })).resolves.toEqual({ ok: true });
    await expect(adjustStockAction({ actingBranchId: branchId, itemId, expectedVersion: 1, quantityDelta: -1, reason: "Count correction" })).resolves.toEqual({ ok: true });
    await expect(issueStockAction({ actingBranchId: branchId, itemId, expectedVersion: 1, quantity: 1, reason: "Treatment room" })).resolves.toEqual({ ok: true });
    expect(mocks.adjustStock).toHaveBeenCalledWith(expect.objectContaining({ reason: "Count correction" }));
    expect(mocks.issueStock).toHaveBeenCalledWith(expect.objectContaining({ reason: "Treatment room" }));
  });

  it("rejects a missing adjustment reason before authorization", async () => {
    await expect(adjustStockAction({ actingBranchId: branchId, itemId, expectedVersion: 1, quantityDelta: -1, reason: "" })).resolves.toEqual({ ok: false, message: "Add a reason for this stock change." });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
  });

  it("maps insufficient stock, stale versions, and invalid transfer states safely", async () => {
    mocks.issueStock.mockRejectedValueOnce(new mocks.InventoryServiceError("INSUFFICIENT_STOCK"));
    await expect(issueStockAction({ actingBranchId: branchId, itemId, expectedVersion: 1, quantity: 9, reason: "Treatment room" })).resolves.toEqual({ ok: false, message: "Not enough stock on hand." });
    mocks.adjustStock.mockRejectedValueOnce(new mocks.InventoryServiceError("STALE_VERSION"));
    await expect(adjustStockAction({ actingBranchId: branchId, itemId, expectedVersion: 1, quantityDelta: 1, reason: "Correction" })).resolves.toEqual({ ok: false, message: "This inventory record changed elsewhere. Refresh and try again." });
    mocks.confirmTransferReceipt.mockRejectedValueOnce(new mocks.InventoryServiceError("INVALID_STATE"));
    await expect(confirmTransferAction({ actingBranchId: destinationBranchId, transferId, expectedVersion: 1 })).resolves.toEqual({ ok: false, message: "That transfer is no longer available for this action." });
  });

  it("creates, confirms, and cancels transfers without accepting an organization id", async () => {
    await createTransferAction({ actingBranchId: branchId, sourceBranchId: branchId, destinationBranchId, itemId, quantity: 2, reason: "Rebalance", organizationId: "foreign" } as never);
    expect(mocks.createInventoryTransfer).toHaveBeenCalledWith({ actingBranchId: branchId, sourceBranchId: branchId, destinationBranchId, itemId, quantity: 2, reason: "Rebalance" });
    await confirmTransferAction({ actingBranchId: destinationBranchId, transferId, expectedVersion: 1 });
    expect(mocks.confirmTransferReceipt).toHaveBeenCalledWith({ actingBranchId: destinationBranchId, transferId, expectedVersion: 1 });
    await cancelTransferAction({ actingBranchId: branchId, transferId, expectedVersion: 1, reason: "No longer needed" });
    expect(mocks.cancelInventoryTransfer).toHaveBeenCalledWith({ actingBranchId: branchId, transferId, expectedVersion: 1, reason: "No longer needed" });
  });

  it("rejects a forged transfer source before authorization", async () => {
    await expect(createTransferAction({ actingBranchId: destinationBranchId, sourceBranchId: branchId, destinationBranchId, itemId, quantity: 2 })).resolves.toEqual({ ok: false, message: "Review the transfer fields and try again." });
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.createInventoryTransfer).not.toHaveBeenCalled();
  });

  it("loads the branch movement ledger under inventory.view", async () => {
    await expect(listMovementsAction({ actingBranchId: branchId, itemId: null })).resolves.toEqual({ ok: true, movements: [] });
    expect(mocks.requirePermission).toHaveBeenCalledWith({ permission: "inventory.view", branchId });
    expect(mocks.listInventoryMovements).toHaveBeenCalledWith({ actingBranchId: branchId, itemId: null });
  });
});
