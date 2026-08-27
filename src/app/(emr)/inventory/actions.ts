"use server";

import { revalidatePath } from "next/cache";

import { AuthorizationError, requirePermission } from "@/lib/authorization";
import {
  adjustStockInputSchema, cancelInventoryTransferInputSchema, confirmTransferReceiptInputSchema,
  createInventoryItemInputSchema, createInventoryTransferInputSchema, issueStockInputSchema,
  listInventoryMovementsInputSchema, listInventoryStockInputSchema, receiveStockInputSchema,
  updateInventoryItemInputSchema,
} from "@/lib/inventory/schema";
import {
  adjustStock, cancelInventoryTransfer, confirmTransferReceipt, createInventoryItem,
  createInventoryTransfer, getInventoryAggregate, InventoryServiceError, issueStock,
  listInventoryItems, listInventoryMovements, listInventoryStock, listInventoryTransfers,
  receiveStock, updateInventoryItem,
} from "@/lib/inventory/service";
import type { InventoryAggregate, InventoryCategory, InventoryItem, InventoryMovement, InventoryStockRow, InventoryTransfer } from "@/lib/inventory/types";

const inventoryPath = "/inventory";
type MutationState = { ok: true } | { ok: false; message: string };
export type InventoryLoadState = { ok: true; items: InventoryItem[]; stock: InventoryStockRow[]; aggregate: InventoryAggregate[]; transfers: InventoryTransfer[] } | { ok: false; message: string };
export type MovementLoadState = { ok: true; movements: InventoryMovement[] } | { ok: false; message: string };

function deniedMessage() { return "Your current organization access does not allow this action."; }

function mutationError(error: unknown, fallback: string): { ok: false; message: string } {
  if (error instanceof AuthorizationError) return { ok: false, message: deniedMessage() };
  if (error instanceof InventoryServiceError) {
    if (error.code === "NOT_AUTHORIZED") return { ok: false, message: deniedMessage() };
    if (error.code === "INSUFFICIENT_STOCK") return { ok: false, message: "Not enough stock on hand." };
    if (error.code === "STALE_VERSION") return { ok: false, message: "This inventory record changed elsewhere. Refresh and try again." };
    if (error.code === "INVALID_STATE") return { ok: false, message: "That transfer is no longer available for this action." };
  }
  return { ok: false, message: fallback };
}

export async function loadInventoryAction(input: { actingBranchId: string }): Promise<InventoryLoadState> {
  const parsed = listInventoryStockInputSchema.safeParse({ ...input, itemId: null, lowOnly: false });
  if (!parsed.success) return { ok: false, message: "The inventory could not be read." };
  try {
    await requirePermission({ permission: "inventory.view", branchId: parsed.data.actingBranchId });
    const [items, stock, aggregate, transfers] = await Promise.all([
      listInventoryItems({ actingBranchId: parsed.data.actingBranchId }),
      listInventoryStock(parsed.data),
      getInventoryAggregate({ actingBranchId: parsed.data.actingBranchId }),
      listInventoryTransfers({ actingBranchId: parsed.data.actingBranchId, status: null }),
    ]);
    revalidatePath(inventoryPath);
    return { ok: true, items, stock, aggregate, transfers };
  } catch (error) {
    if (error instanceof AuthorizationError || (error instanceof InventoryServiceError && error.code === "NOT_AUTHORIZED")) return { ok: false, message: deniedMessage() };
    return { ok: false, message: "The inventory could not be loaded. Refresh to try again." };
  }
}

export async function listMovementsAction(input: { actingBranchId: string; itemId?: string | null }): Promise<MovementLoadState> {
  const parsed = listInventoryMovementsInputSchema.safeParse({ actingBranchId: input.actingBranchId, itemId: input.itemId ?? null });
  if (!parsed.success) return { ok: false, message: "The movement history could not be read." };
  try {
    await requirePermission({ permission: "inventory.view", branchId: parsed.data.actingBranchId });
    return { ok: true, movements: await listInventoryMovements(parsed.data) };
  } catch (error) {
    if (error instanceof AuthorizationError) return { ok: false, message: deniedMessage() };
    return { ok: false, message: "The movement history could not be loaded." };
  }
}

export async function createItemAction(input: { actingBranchId: string; code: string; name: string; category: InventoryCategory; unit: string; reorderLevel: number; lotTracking: boolean }): Promise<MutationState> {
  const parsed = createInventoryItemInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the item fields and try again." };
  try { await requirePermission({ permission: "inventory.manage", branchId: parsed.data.actingBranchId }); await createInventoryItem(parsed.data); revalidatePath(inventoryPath); return { ok: true }; }
  catch (error) { return mutationError(error, "The inventory item could not be created."); }
}

export async function updateItemAction(input: { actingBranchId: string; itemId: string; expectedVersion: number; name: string; category: InventoryCategory; unit: string; reorderLevel: number; lotTracking: boolean; isActive: boolean }): Promise<MutationState> {
  const parsed = updateInventoryItemInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the item fields and try again." };
  try { await requirePermission({ permission: "inventory.manage", branchId: parsed.data.actingBranchId }); await updateInventoryItem(parsed.data); revalidatePath(inventoryPath); return { ok: true }; }
  catch (error) { return mutationError(error, "The inventory item could not be updated."); }
}

export async function receiveStockAction(input: { actingBranchId: string; itemId: string; quantity: number; lotNumber?: string | null; expiryDate?: string | null }): Promise<MutationState> {
  const parsed = receiveStockInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Review the receipt fields and try again." };
  try { await requirePermission({ permission: "inventory.manage", branchId: parsed.data.actingBranchId }); await receiveStock(parsed.data); revalidatePath(inventoryPath); return { ok: true }; }
  catch (error) { return mutationError(error, "The stock receipt could not be recorded."); }
}

export async function adjustStockAction(input: { actingBranchId: string; itemId: string; expectedVersion: number; quantityDelta: number; reason: string }): Promise<MutationState> {
  const parsed = adjustStockInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: input.reason.trim() ? "Review the adjustment fields and try again." : "Add a reason for this stock change." };
  try { await requirePermission({ permission: "inventory.manage", branchId: parsed.data.actingBranchId }); await adjustStock(parsed.data); revalidatePath(inventoryPath); return { ok: true }; }
  catch (error) { return mutationError(error, "The stock adjustment could not be recorded."); }
}

export async function issueStockAction(input: { actingBranchId: string; itemId: string; expectedVersion: number; quantity: number; reason: string }): Promise<MutationState> {
  const parsed = issueStockInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: input.reason.trim() ? "Review the issue fields and try again." : "Add a reason for this stock issue." };
  try { await requirePermission({ permission: "inventory.manage", branchId: parsed.data.actingBranchId }); await issueStock(parsed.data); revalidatePath(inventoryPath); return { ok: true }; }
  catch (error) { return mutationError(error, "The stock issue could not be recorded."); }
}

export async function createTransferAction(input: { actingBranchId: string; sourceBranchId: string; destinationBranchId: string; itemId: string; quantity: number; reason?: string | null }): Promise<MutationState> {
  const parsed = createInventoryTransferInputSchema.safeParse({ actingBranchId: input.actingBranchId, sourceBranchId: input.sourceBranchId, destinationBranchId: input.destinationBranchId, itemId: input.itemId, quantity: input.quantity, reason: input.reason ?? null });
  if (!parsed.success) return { ok: false, message: "Review the transfer fields and try again." };
  try { await requirePermission({ permission: "inventory.manage", branchId: parsed.data.actingBranchId }); await createInventoryTransfer(parsed.data); revalidatePath(inventoryPath); return { ok: true }; }
  catch (error) { return mutationError(error, "The transfer could not be created."); }
}

export async function confirmTransferAction(input: { actingBranchId: string; transferId: string; expectedVersion: number }): Promise<MutationState> {
  const parsed = confirmTransferReceiptInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That transfer could not be confirmed." };
  try { await requirePermission({ permission: "inventory.manage", branchId: parsed.data.actingBranchId }); await confirmTransferReceipt(parsed.data); revalidatePath(inventoryPath); return { ok: true }; }
  catch (error) { return mutationError(error, "The transfer receipt could not be confirmed."); }
}

export async function cancelTransferAction(input: { actingBranchId: string; transferId: string; expectedVersion: number; reason: string }): Promise<MutationState> {
  const parsed = cancelInventoryTransferInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: input.reason.trim() ? "That transfer could not be cancelled." : "Add a cancellation reason." };
  try { await requirePermission({ permission: "inventory.manage", branchId: parsed.data.actingBranchId }); await cancelInventoryTransfer(parsed.data); revalidatePath(inventoryPath); return { ok: true }; }
  catch (error) { return mutationError(error, "The transfer could not be cancelled."); }
}
