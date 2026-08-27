import type { z } from "zod";

import type {
  adjustStockInputSchema, cancelInventoryTransferInputSchema, confirmTransferReceiptInputSchema,
  createInventoryItemInputSchema, createInventoryTransferInputSchema, getInventoryAggregateInputSchema,
  inventoryCategorySchema, inventoryMovementTypeSchema, inventoryTransferStatusSchema, issueStockInputSchema,
  listInventoryItemsInputSchema, listInventoryMovementsInputSchema, listInventoryStockInputSchema,
  listInventoryTransfersInputSchema, receiveStockInputSchema, updateInventoryItemInputSchema,
} from "./schema";

export type InventoryCategory = z.infer<typeof inventoryCategorySchema>;
export type InventoryMovementType = z.infer<typeof inventoryMovementTypeSchema>;
export type InventoryTransferStatus = z.infer<typeof inventoryTransferStatusSchema>;
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemInputSchema>;
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemInputSchema>;
export type ListInventoryItemsInput = z.infer<typeof listInventoryItemsInputSchema>;
export type ReceiveStockInput = z.infer<typeof receiveStockInputSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockInputSchema>;
export type IssueStockInput = z.infer<typeof issueStockInputSchema>;
export type CreateInventoryTransferInput = z.infer<typeof createInventoryTransferInputSchema>;
export type ConfirmTransferReceiptInput = z.infer<typeof confirmTransferReceiptInputSchema>;
export type CancelInventoryTransferInput = z.infer<typeof cancelInventoryTransferInputSchema>;
export type ListInventoryStockInput = z.infer<typeof listInventoryStockInputSchema>;
export type ListInventoryMovementsInput = z.infer<typeof listInventoryMovementsInputSchema>;
export type GetInventoryAggregateInput = z.infer<typeof getInventoryAggregateInputSchema>;
export type ListInventoryTransfersInput = z.infer<typeof listInventoryTransfersInputSchema>;

export type InventoryItem = { itemId: string; code: string; name: string; category: InventoryCategory; unit: string; reorderLevel: number; lotTracking: boolean; isActive: boolean; version: number };
export type InventoryStockRow = { itemId: string; itemCode: string; itemName: string; branchId: string; quantityOnHand: number; reorderLevelOverride: number | null; reorderLevel: number; lowStock: boolean; version: number };
export type InventoryMovement = { movementId: string; itemId: string; itemCode: string; movementType: InventoryMovementType; quantityDelta: number; reason: string | null; transferId: string | null; lotNumber: string | null; expiryDate: string | null; recordedBy: string | null; recordedAt: string };
export type InventoryTransfer = { transferId: string; itemId: string; itemCode: string; itemName: string; sourceBranchId: string; destinationBranchId: string; quantity: number; status: InventoryTransferStatus; reason: string | null; confirmedAt: string | null; version: number; createdAt: string };
export type InventoryAggregate = { itemId: string; itemCode: string; itemName: string; totalOnHand: number; branches: Array<{ branchId: string; quantity: number; low: boolean }> };
export type InventoryItemMutationResult = { itemId: string; version: number };
export type InventoryStockMutationResult = { itemId: string; branchId: string; quantityOnHand: number; version: number };
export type InventoryTransferMutationResult = { transferId: string; version: number };
export type InventoryTransferTransitionResult = InventoryTransferMutationResult & { status: InventoryTransferStatus };
