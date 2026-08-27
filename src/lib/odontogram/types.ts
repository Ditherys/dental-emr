import type { z } from "zod";

import type {
  createToothConditionInputSchema,
  listToothConditionsInputSchema,
  toothFindingTypeSchema,
  toothStatusSchema,
  toothSurfaceSchema,
  voidToothConditionInputSchema,
} from "./schema";

export type ToothStatus = z.infer<typeof toothStatusSchema>;
export type ToothSurface = z.infer<typeof toothSurfaceSchema>;
export type ToothFinding = z.infer<typeof toothFindingTypeSchema>;

export type ToothCondition = {
  conditionId: string;
  toothCode: string;
  surface: ToothSurface;
  status: ToothStatus;
  findingType: ToothFinding;
  notes: string | null;
  recordedBy: string;
  recordedAt: string;
  voidedAt: string | null;
  version: number;
};

export type ToothConditionMutationResult = { conditionId: string; version: number };

export type CreateToothConditionInput = z.infer<typeof createToothConditionInputSchema>;
export type VoidToothConditionInput = z.infer<typeof voidToothConditionInputSchema>;
export type ListToothConditionsInput = z.infer<typeof listToothConditionsInputSchema>;