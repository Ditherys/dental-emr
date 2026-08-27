import "server-only";

import { z } from "zod";

import { databaseUuid } from "@/lib/validation/database-uuid";

const positiveInteger = z.number().int().positive();
const version = z.number().int().positive();
const reason = z.string().trim().min(1).max(500);
const nullableItemId = databaseUuid.nullable().optional();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoTimestamp = z.iso.datetime({ offset: true });

export const inventoryCategorySchema = z.enum(["CONSUMABLE", "EQUIPMENT"]);
export const inventoryMovementTypeSchema = z.enum(["RECEIPT", "ADJUSTMENT", "ISSUE", "TRANSFER_OUT", "TRANSFER_IN"]);
export const inventoryTransferStatusSchema = z.enum(["SENT", "PENDING_RECEIPT", "RECEIVED", "CANCELLED"]);

export const createInventoryItemInputSchema = z.object({
  actingBranchId: databaseUuid,
  code: z.string().min(1).max(80).regex(/^[A-Z][A-Z0-9_]*$/),
  name: z.string().trim().min(1).max(160),
  category: inventoryCategorySchema,
  unit: z.string().trim().min(1).max(40),
  reorderLevel: z.number().int().nonnegative(),
  lotTracking: z.boolean().optional(),
}).strict();

export const updateInventoryItemInputSchema = z.object({
  actingBranchId: databaseUuid,
  itemId: databaseUuid,
  expectedVersion: version,
  name: z.string().trim().min(1).max(160),
  category: inventoryCategorySchema,
  unit: z.string().trim().min(1).max(40),
  reorderLevel: z.number().int().nonnegative(),
  lotTracking: z.boolean(),
  isActive: z.boolean(),
}).strict();

export const listInventoryItemsInputSchema = z.object({ actingBranchId: databaseUuid, includeInactive: z.boolean().optional() }).strict();

export const receiveStockInputSchema = z.object({
  actingBranchId: databaseUuid,
  itemId: databaseUuid,
  quantity: positiveInteger,
  lotNumber: z.string().trim().min(1).max(100).nullable().optional(),
  expiryDate: dateOnly.nullable().optional(),
}).strict();

export const adjustStockInputSchema = z.object({ actingBranchId: databaseUuid, itemId: databaseUuid, expectedVersion: version, quantityDelta: z.number().int().refine((value) => value !== 0), reason }).strict();
export const issueStockInputSchema = z.object({ actingBranchId: databaseUuid, itemId: databaseUuid, expectedVersion: version, quantity: positiveInteger, reason }).strict();

export const createInventoryTransferInputSchema = z.object({
  actingBranchId: databaseUuid,
  sourceBranchId: databaseUuid,
  destinationBranchId: databaseUuid,
  itemId: databaseUuid,
  quantity: positiveInteger,
  reason: reason.nullable().optional(),
}).strict()
  .refine((value) => value.sourceBranchId === value.actingBranchId, { path: ["sourceBranchId"] })
  .refine((value) => value.sourceBranchId !== value.destinationBranchId, { path: ["destinationBranchId"] });

export const confirmTransferReceiptInputSchema = z.object({ actingBranchId: databaseUuid, transferId: databaseUuid, expectedVersion: version }).strict();
export const cancelInventoryTransferInputSchema = confirmTransferReceiptInputSchema.extend({ reason }).strict();
export const listInventoryStockInputSchema = z.object({ actingBranchId: databaseUuid, itemId: nullableItemId, lowOnly: z.boolean().optional() }).strict();
export const listInventoryMovementsInputSchema = z.object({ actingBranchId: databaseUuid, itemId: nullableItemId }).strict();
export const getInventoryAggregateInputSchema = z.object({ actingBranchId: databaseUuid }).strict();
export const listInventoryTransfersInputSchema = z.object({ actingBranchId: databaseUuid, status: inventoryTransferStatusSchema.nullable().optional() }).strict();

export const inventoryItemMutationRowSchema = z.object({ item_id: databaseUuid, version }).strict();
export const inventoryItemRowSchema = z.object({ item_id: databaseUuid, code: z.string(), name: z.string(), category: inventoryCategorySchema, unit: z.string(), reorder_level: z.number().int().nonnegative(), lot_tracking: z.boolean(), is_active: z.boolean(), version }).strict();
export const inventoryStockMutationRowSchema = z.object({ item_id: databaseUuid, branch_id: databaseUuid, quantity_on_hand: z.number().int().nonnegative(), version }).strict();
export const inventoryTransferMutationRowSchema = z.object({ transfer_id: databaseUuid, version }).strict();
export const inventoryTransferTransitionRowSchema = z.object({ transfer_id: databaseUuid, status: inventoryTransferStatusSchema, version }).strict();
export const inventoryStockRowSchema = z.object({ item_id: databaseUuid, item_code: z.string(), item_name: z.string(), branch_id: databaseUuid, quantity_on_hand: z.number().int().nonnegative(), reorder_level_override: z.number().int().nonnegative().nullable(), reorder_level: z.number().int().nonnegative(), low_stock: z.boolean(), version }).strict();
export const inventoryMovementRowSchema = z.object({ movement_id: databaseUuid, item_id: databaseUuid, item_code: z.string(), movement_type: inventoryMovementTypeSchema, quantity_delta: z.number().int(), reason: z.string().nullable(), transfer_id: databaseUuid.nullable(), lot_number: z.string().nullable(), expiry_date: dateOnly.nullable(), recorded_by: databaseUuid.nullable(), recorded_at: isoTimestamp }).strict();
export const inventoryAggregateBranchSchema = z.object({ branch: databaseUuid, quantity: z.number().int().nonnegative(), low: z.boolean() }).strict();
export const inventoryAggregateRowSchema = z.object({ item_id: databaseUuid, item_code: z.string(), item_name: z.string(), total_on_hand: z.number().int().nonnegative(), branches: z.array(inventoryAggregateBranchSchema) }).strict();
export const inventoryTransferRowSchema = z.object({ transfer_id: databaseUuid, item_id: databaseUuid, item_code: z.string(), item_name: z.string(), source_branch_id: databaseUuid, destination_branch_id: databaseUuid, quantity: positiveInteger, status: inventoryTransferStatusSchema, reason: z.string().nullable(), confirmed_at: isoTimestamp.nullable(), version, created_at: isoTimestamp }).strict();
