import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));

import { InventoryServiceError, mapInventoryRpcError } from "./errors";
import {
  adjustStock,
  cancelInventoryTransfer,
  confirmTransferReceipt,
  createInventoryItem,
  createInventoryTransfer,
  getInventoryAggregate,
  issueStock,
  listInventoryItems,
  listInventoryMovements,
  listInventoryStock,
  listInventoryTransfers,
  receiveStock,
  updateInventoryItem,
} from "./service";

const branchId = "d1000000-0000-0000-0000-000000000001";
const secondBranchId = "d1000000-0000-0000-0000-000000000002";
const itemId = "d2000000-0000-0000-0000-000000000001";
const transferId = "d3000000-0000-0000-0000-000000000001";

beforeEach(() => rpc.mockReset());

describe("inventory service", () => {
  it("maps RPC failures without leaking database messages", () => {
    expect(mapInventoryRpcError({ code: "42501", message: "not authorized" })).toEqual(new InventoryServiceError("NOT_AUTHORIZED"));
    expect(mapInventoryRpcError({ code: "22023", message: "invalid input" })).toEqual(new InventoryServiceError("INVALID_INPUT"));
    expect(mapInventoryRpcError({ code: "P0001", message: "insufficient stock" })).toEqual(new InventoryServiceError("INSUFFICIENT_STOCK"));
    expect(mapInventoryRpcError({ code: "P0001", message: "stale version" })).toEqual(new InventoryServiceError("STALE_VERSION"));
    expect(mapInventoryRpcError({ code: "P0001", message: "invalid state" })).toEqual(new InventoryServiceError("INVALID_STATE"));
    expect(mapInventoryRpcError("boom")).toEqual(new InventoryServiceError("FAILED"));
  });

  it("rejects malformed and forged item input before an RPC", async () => {
    await expect(createInventoryItem({ actingBranchId: branchId, code: "lower", name: "Gloves", category: "CONSUMABLE", unit: "box", reorderLevel: 5 })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createInventoryItem({ actingBranchId: branchId, code: "GLOVES", name: "Gloves", category: "CONSUMABLE", unit: "box", reorderLevel: 5, organizationId: "foreign" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(adjustStock({ actingBranchId: branchId, itemId, expectedVersion: 1, quantityDelta: -1, reason: "" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(issueStock({ actingBranchId: branchId, itemId, expectedVersion: 1, quantity: 0, reason: "Used" })).rejects.toBeInstanceOf(z.ZodError);
    await expect(createInventoryTransfer({ actingBranchId: secondBranchId, sourceBranchId: branchId, destinationBranchId: secondBranchId, itemId, quantity: 1 })).rejects.toBeInstanceOf(z.ZodError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("binds item create, update, and list to exact RPC contracts", async () => {
    rpc.mockResolvedValueOnce({ data: [{ item_id: itemId, version: 1 }], error: null });
    await expect(createInventoryItem({ actingBranchId: branchId, code: "GLOVES", name: "Exam gloves", category: "CONSUMABLE", unit: "box", reorderLevel: 5, lotTracking: true })).resolves.toEqual({ itemId, version: 1 });
    expect(rpc).toHaveBeenLastCalledWith("create_inventory_item", { p_acting_branch_id: branchId, p_code: "GLOVES", p_name: "Exam gloves", p_category: "CONSUMABLE", p_unit: "box", p_reorder_level: 5, p_lot_tracking: true });

    rpc.mockResolvedValueOnce({ data: [{ item_id: itemId, version: 2 }], error: null });
    await updateInventoryItem({ actingBranchId: branchId, itemId, expectedVersion: 1, name: "Nitrile gloves", category: "CONSUMABLE", unit: "box", reorderLevel: 6, lotTracking: true, isActive: true });
    expect(rpc).toHaveBeenLastCalledWith("update_inventory_item", { p_acting_branch_id: branchId, p_item_id: itemId, p_expected_version: 1, p_name: "Nitrile gloves", p_category: "CONSUMABLE", p_unit: "box", p_reorder_level: 6, p_lot_tracking: true, p_is_active: true });

    rpc.mockResolvedValueOnce({ data: [{ item_id: itemId, code: "GLOVES", name: "Nitrile gloves", category: "CONSUMABLE", unit: "box", reorder_level: 6, lot_tracking: true, is_active: true, version: 2 }], error: null });
    await expect(listInventoryItems({ actingBranchId: branchId })).resolves.toEqual([{ itemId, code: "GLOVES", name: "Nitrile gloves", category: "CONSUMABLE", unit: "box", reorderLevel: 6, lotTracking: true, isActive: true, version: 2 }]);
  });

  it("binds receipt, adjustment, and issue to exact versioned contracts", async () => {
    const row = { item_id: itemId, branch_id: branchId, quantity_on_hand: 10, version: 2 };
    rpc.mockResolvedValueOnce({ data: [row], error: null });
    await receiveStock({ actingBranchId: branchId, itemId, quantity: 10, lotNumber: "LOT-1", expiryDate: "2027-01-31" });
    expect(rpc).toHaveBeenLastCalledWith("receive_stock", { p_acting_branch_id: branchId, p_item_id: itemId, p_quantity: 10, p_lot_number: "LOT-1", p_expiry_date: "2027-01-31" });

    rpc.mockResolvedValueOnce({ data: [{ ...row, quantity_on_hand: 8, version: 3 }], error: null });
    await adjustStock({ actingBranchId: branchId, itemId, expectedVersion: 2, quantityDelta: -2, reason: "Count correction" });
    expect(rpc).toHaveBeenLastCalledWith("adjust_stock", { p_acting_branch_id: branchId, p_item_id: itemId, p_expected_version: 2, p_quantity_delta: -2, p_reason: "Count correction" });

    rpc.mockResolvedValueOnce({ data: [{ ...row, quantity_on_hand: 7, version: 4 }], error: null });
    await issueStock({ actingBranchId: branchId, itemId, expectedVersion: 3, quantity: 1, reason: "Treatment room" });
    expect(rpc).toHaveBeenLastCalledWith("issue_stock", { p_acting_branch_id: branchId, p_item_id: itemId, p_expected_version: 3, p_quantity: 1, p_reason: "Treatment room" });
  });

  it("binds transfer create, list, destination confirmation, and cancellation", async () => {
    rpc.mockResolvedValueOnce({ data: [{ transfer_id: transferId, version: 1 }], error: null });
    await createInventoryTransfer({ actingBranchId: branchId, sourceBranchId: branchId, destinationBranchId: secondBranchId, itemId, quantity: 3, reason: "Rebalance" });
    expect(rpc).toHaveBeenLastCalledWith("create_inventory_transfer", { p_acting_branch_id: branchId, p_source_branch_id: branchId, p_destination_branch_id: secondBranchId, p_item_id: itemId, p_quantity: 3, p_reason: "Rebalance" });

    rpc.mockResolvedValueOnce({ data: [{ transfer_id: transferId, item_id: itemId, item_code: "GLOVES", item_name: "Exam gloves", source_branch_id: branchId, destination_branch_id: secondBranchId, quantity: 3, status: "SENT", reason: "Rebalance", confirmed_at: null, version: 1, created_at: "2026-08-27T10:00:00+00:00" }], error: null });
    await expect(listInventoryTransfers({ actingBranchId: secondBranchId, status: "SENT" })).resolves.toHaveLength(1);
    expect(rpc).toHaveBeenLastCalledWith("list_inventory_transfers", { p_acting_branch_id: secondBranchId, p_status: "SENT" });

    rpc.mockResolvedValueOnce({ data: [{ transfer_id: transferId, status: "RECEIVED", version: 2 }], error: null });
    await confirmTransferReceipt({ actingBranchId: secondBranchId, transferId, expectedVersion: 1 });
    expect(rpc).toHaveBeenLastCalledWith("confirm_transfer_receipt", { p_acting_branch_id: secondBranchId, p_transfer_id: transferId, p_expected_version: 1 });

    rpc.mockResolvedValueOnce({ data: [{ transfer_id: transferId, status: "CANCELLED", version: 2 }], error: null });
    await cancelInventoryTransfer({ actingBranchId: branchId, transferId, expectedVersion: 1, reason: "No longer needed" });
    expect(rpc).toHaveBeenLastCalledWith("cancel_inventory_transfer", { p_acting_branch_id: branchId, p_transfer_id: transferId, p_expected_version: 1, p_reason: "No longer needed" });
  });

  it("maps stock, movement, and aggregate projections", async () => {
    rpc.mockResolvedValueOnce({ data: [{ item_id: itemId, item_code: "GLOVES", item_name: "Exam gloves", branch_id: branchId, quantity_on_hand: 2, reorder_level_override: null, reorder_level: 5, low_stock: true, version: 1 }], error: null });
    await expect(listInventoryStock({ actingBranchId: branchId })).resolves.toEqual([{ itemId, itemCode: "GLOVES", itemName: "Exam gloves", branchId, quantityOnHand: 2, reorderLevelOverride: null, reorderLevel: 5, lowStock: true, version: 1 }]);

    rpc.mockResolvedValueOnce({ data: [{ movement_id: "d4000000-0000-0000-0000-000000000001", item_id: itemId, item_code: "GLOVES", movement_type: "RECEIPT", quantity_delta: 10, reason: null, transfer_id: null, lot_number: "LOT-1", expiry_date: "2027-01-31", recorded_by: null, recorded_at: "2026-08-27T10:00:00+00:00" }], error: null });
    await expect(listInventoryMovements({ actingBranchId: branchId })).resolves.toHaveLength(1);

    rpc.mockResolvedValueOnce({ data: [{ item_id: itemId, item_code: "GLOVES", item_name: "Exam gloves", total_on_hand: 12, branches: [{ branch: branchId, quantity: 2, low: true }, { branch: secondBranchId, quantity: 10, low: false }] }], error: null });
    await expect(getInventoryAggregate({ actingBranchId: branchId })).resolves.toEqual([{ itemId, itemCode: "GLOVES", itemName: "Exam gloves", totalOnHand: 12, branches: [{ branchId, quantity: 2, low: true }, { branchId: secondBranchId, quantity: 10, low: false }] }]);
  });
});
