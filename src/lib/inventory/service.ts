import "server-only";

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

import { InventoryServiceError, mapInventoryRpcError } from "./errors";
import {
  adjustStockInputSchema, cancelInventoryTransferInputSchema, confirmTransferReceiptInputSchema,
  createInventoryItemInputSchema, createInventoryTransferInputSchema, getInventoryAggregateInputSchema,
  inventoryAggregateRowSchema, inventoryItemMutationRowSchema, inventoryItemRowSchema,
  inventoryMovementRowSchema, inventoryStockMutationRowSchema, inventoryStockRowSchema,
  inventoryTransferMutationRowSchema, inventoryTransferRowSchema, inventoryTransferTransitionRowSchema,
  issueStockInputSchema, listInventoryItemsInputSchema, listInventoryMovementsInputSchema,
  listInventoryStockInputSchema, listInventoryTransfersInputSchema, receiveStockInputSchema,
  updateInventoryItemInputSchema,
} from "./schema";
import type { InventoryAggregate, InventoryItem, InventoryItemMutationResult, InventoryMovement, InventoryStockMutationResult, InventoryStockRow, InventoryTransfer, InventoryTransferMutationResult, InventoryTransferTransitionResult } from "./types";

type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
const rpcResponseSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

async function callRpc(name: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const response = rpcResponseSchema.parse(await (supabase.rpc as unknown as Rpc)(name, args));
  if (response.error) throw mapInventoryRpcError(response.error);
  return response.data;
}

function firstRow(data: unknown) { return Array.isArray(data) ? data[0] : undefined; }

export async function createInventoryItem(input: unknown): Promise<InventoryItemMutationResult> {
  const value = createInventoryItemInputSchema.parse(input);
  const row = inventoryItemMutationRowSchema.parse(firstRow(await callRpc("create_inventory_item", { p_acting_branch_id: value.actingBranchId, p_code: value.code, p_name: value.name, p_category: value.category, p_unit: value.unit, p_reorder_level: value.reorderLevel, p_lot_tracking: value.lotTracking ?? false })));
  return { itemId: row.item_id, version: row.version };
}

export async function updateInventoryItem(input: unknown): Promise<InventoryItemMutationResult> {
  const value = updateInventoryItemInputSchema.parse(input);
  const row = inventoryItemMutationRowSchema.parse(firstRow(await callRpc("update_inventory_item", { p_acting_branch_id: value.actingBranchId, p_item_id: value.itemId, p_expected_version: value.expectedVersion, p_name: value.name, p_category: value.category, p_unit: value.unit, p_reorder_level: value.reorderLevel, p_lot_tracking: value.lotTracking, p_is_active: value.isActive })));
  return { itemId: row.item_id, version: row.version };
}

export async function listInventoryItems(input: unknown): Promise<InventoryItem[]> {
  const value = listInventoryItemsInputSchema.parse(input);
  return z.array(inventoryItemRowSchema).parse(await callRpc("list_inventory_items", { p_acting_branch_id: value.actingBranchId, p_include_inactive: value.includeInactive ?? false })).map((row) => ({ itemId: row.item_id, code: row.code, name: row.name, category: row.category, unit: row.unit, reorderLevel: row.reorder_level, lotTracking: row.lot_tracking, isActive: row.is_active, version: row.version }));
}

function stockResult(row: z.infer<typeof inventoryStockMutationRowSchema>): InventoryStockMutationResult { return { itemId: row.item_id, branchId: row.branch_id, quantityOnHand: row.quantity_on_hand, version: row.version }; }

export async function receiveStock(input: unknown): Promise<InventoryStockMutationResult> {
  const value = receiveStockInputSchema.parse(input);
  return stockResult(inventoryStockMutationRowSchema.parse(firstRow(await callRpc("receive_stock", { p_acting_branch_id: value.actingBranchId, p_item_id: value.itemId, p_quantity: value.quantity, p_lot_number: value.lotNumber ?? null, p_expiry_date: value.expiryDate ?? null }))));
}

export async function adjustStock(input: unknown): Promise<InventoryStockMutationResult> {
  const value = adjustStockInputSchema.parse(input);
  return stockResult(inventoryStockMutationRowSchema.parse(firstRow(await callRpc("adjust_stock", { p_acting_branch_id: value.actingBranchId, p_item_id: value.itemId, p_expected_version: value.expectedVersion, p_quantity_delta: value.quantityDelta, p_reason: value.reason }))));
}

export async function issueStock(input: unknown): Promise<InventoryStockMutationResult> {
  const value = issueStockInputSchema.parse(input);
  return stockResult(inventoryStockMutationRowSchema.parse(firstRow(await callRpc("issue_stock", { p_acting_branch_id: value.actingBranchId, p_item_id: value.itemId, p_expected_version: value.expectedVersion, p_quantity: value.quantity, p_reason: value.reason }))));
}

export async function createInventoryTransfer(input: unknown): Promise<InventoryTransferMutationResult> {
  const value = createInventoryTransferInputSchema.parse(input);
  const row = inventoryTransferMutationRowSchema.parse(firstRow(await callRpc("create_inventory_transfer", { p_acting_branch_id: value.actingBranchId, p_source_branch_id: value.sourceBranchId, p_destination_branch_id: value.destinationBranchId, p_item_id: value.itemId, p_quantity: value.quantity, p_reason: value.reason ?? null })));
  return { transferId: row.transfer_id, version: row.version };
}

async function transitionTransfer(name: string, input: unknown, reasonValue?: string): Promise<InventoryTransferTransitionResult> {
  const value = name === "cancel_inventory_transfer" ? cancelInventoryTransferInputSchema.parse(input) : confirmTransferReceiptInputSchema.parse(input);
  const args: Record<string, unknown> = { p_acting_branch_id: value.actingBranchId, p_transfer_id: value.transferId, p_expected_version: value.expectedVersion };
  if (reasonValue !== undefined) args.p_reason = reasonValue;
  const row = inventoryTransferTransitionRowSchema.parse(firstRow(await callRpc(name, args)));
  return { transferId: row.transfer_id, status: row.status, version: row.version };
}

export async function confirmTransferReceipt(input: unknown) { return transitionTransfer("confirm_transfer_receipt", input); }
export async function cancelInventoryTransfer(input: unknown) { const value = cancelInventoryTransferInputSchema.parse(input); return transitionTransfer("cancel_inventory_transfer", value, value.reason); }

export async function listInventoryStock(input: unknown): Promise<InventoryStockRow[]> {
  const value = listInventoryStockInputSchema.parse(input);
  return z.array(inventoryStockRowSchema).parse(await callRpc("list_inventory_stock", { p_acting_branch_id: value.actingBranchId, p_item_id: value.itemId ?? null, p_low_only: value.lowOnly ?? false })).map((row) => ({ itemId: row.item_id, itemCode: row.item_code, itemName: row.item_name, branchId: row.branch_id, quantityOnHand: row.quantity_on_hand, reorderLevelOverride: row.reorder_level_override, reorderLevel: row.reorder_level, lowStock: row.low_stock, version: row.version }));
}

export async function listInventoryMovements(input: unknown): Promise<InventoryMovement[]> {
  const value = listInventoryMovementsInputSchema.parse(input);
  return z.array(inventoryMovementRowSchema).parse(await callRpc("list_inventory_movements", { p_acting_branch_id: value.actingBranchId, p_item_id: value.itemId ?? null })).map((row) => ({ movementId: row.movement_id, itemId: row.item_id, itemCode: row.item_code, movementType: row.movement_type, quantityDelta: row.quantity_delta, reason: row.reason, transferId: row.transfer_id, lotNumber: row.lot_number, expiryDate: row.expiry_date, recordedBy: row.recorded_by, recordedAt: row.recorded_at }));
}

export async function getInventoryAggregate(input: unknown): Promise<InventoryAggregate[]> {
  const value = getInventoryAggregateInputSchema.parse(input);
  return z.array(inventoryAggregateRowSchema).parse(await callRpc("get_inventory_aggregate", { p_acting_branch_id: value.actingBranchId })).map((row) => ({ itemId: row.item_id, itemCode: row.item_code, itemName: row.item_name, totalOnHand: row.total_on_hand, branches: row.branches.map((branch) => ({ branchId: branch.branch, quantity: branch.quantity, low: branch.low })) }));
}

export async function listInventoryTransfers(input: unknown): Promise<InventoryTransfer[]> {
  const value = listInventoryTransfersInputSchema.parse(input);
  return z.array(inventoryTransferRowSchema).parse(await callRpc("list_inventory_transfers", { p_acting_branch_id: value.actingBranchId, p_status: value.status ?? null })).map((row) => ({ transferId: row.transfer_id, itemId: row.item_id, itemCode: row.item_code, itemName: row.item_name, sourceBranchId: row.source_branch_id, destinationBranchId: row.destination_branch_id, quantity: row.quantity, status: row.status, reason: row.reason, confirmedAt: row.confirmed_at, version: row.version, createdAt: row.created_at }));
}

export { InventoryServiceError };
