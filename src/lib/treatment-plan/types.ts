import type { z } from "zod";

import type {
  acknowledgeTreatmentPlanInputSchema,
  addTreatmentPlanAlternativeInputSchema,
  addTreatmentPlanDiscussionInputSchema,
  addTreatmentPlanItemInputSchema,
  createTreatmentPlanInputSchema,
  drawingJsonSchema,
  generateTreatmentPlanDocumentInputSchema,
  getTreatmentPlanDetailInputSchema,
  listTreatmentPlansInputSchema,
  presentTreatmentPlanInputSchema,
  removeTreatmentPlanItemInputSchema,
  saveTreatmentPlanDrawingInputSchema,
  treatmentPlanAlternativeJsonSchema,
  treatmentPlanDetailJsonSchema,
  treatmentPlanDiscussionJsonSchema,
  treatmentPlanDrawingJsonSchema,
  treatmentPlanItemJsonSchema,
  treatmentPlanJsonSchema,
  treatmentPlanStatusSchema,
  updateTreatmentPlanInputSchema,
  updateTreatmentPlanItemInputSchema,
} from "./schema";

export type TreatmentPlanStatus = z.infer<typeof treatmentPlanStatusSchema>;

export type TreatmentPlan = {
  planId: string;
  title: string;
  status: TreatmentPlanStatus;
  version: number;
  createdAt: string;
  itemCount: number;
  hasDrawing: boolean;
};

export type TreatmentPlanDetailPlan = z.infer<typeof treatmentPlanJsonSchema>;
export type TreatmentPlanItem = z.infer<typeof treatmentPlanItemJsonSchema>;
export type TreatmentPlanAlternative = z.infer<typeof treatmentPlanAlternativeJsonSchema>;
export type TreatmentPlanDiscussion = z.infer<typeof treatmentPlanDiscussionJsonSchema>;
export type TreatmentPlanDrawing = z.infer<typeof treatmentPlanDrawingJsonSchema>;
export type TreatmentPlanDrawingCanvas = z.infer<typeof drawingJsonSchema>;
export type TreatmentPlanDetail = z.infer<typeof treatmentPlanDetailJsonSchema>;

export type TreatmentPlanMutationResult = { planId: string; version: number };
export type TreatmentPlanItemMutationResult = { itemId: string; lineNo: number };
export type TreatmentPlanAlternativeMutationResult = { alternativeId: string; alternativeNo: number };
export type TreatmentPlanDiscussionMutationResult = { discussionId: string; discussedAt: string };
export type TreatmentPlanDrawingMutationResult = { drawingId: string; version: number };

export type CreateTreatmentPlanInput = z.infer<typeof createTreatmentPlanInputSchema>;
export type UpdateTreatmentPlanInput = z.infer<typeof updateTreatmentPlanInputSchema>;
export type PresentTreatmentPlanInput = z.infer<typeof presentTreatmentPlanInputSchema>;
export type AcknowledgeTreatmentPlanInput = z.infer<typeof acknowledgeTreatmentPlanInputSchema>;
export type AddTreatmentPlanItemInput = z.infer<typeof addTreatmentPlanItemInputSchema>;
export type UpdateTreatmentPlanItemInput = z.infer<typeof updateTreatmentPlanItemInputSchema>;
export type RemoveTreatmentPlanItemInput = z.infer<typeof removeTreatmentPlanItemInputSchema>;
export type AddTreatmentPlanAlternativeInput = z.infer<typeof addTreatmentPlanAlternativeInputSchema>;
export type AddTreatmentPlanDiscussionInput = z.infer<typeof addTreatmentPlanDiscussionInputSchema>;
export type SaveTreatmentPlanDrawingInput = z.infer<typeof saveTreatmentPlanDrawingInputSchema>;
export type ListTreatmentPlansInput = z.infer<typeof listTreatmentPlansInputSchema>;
export type GetTreatmentPlanDetailInput = z.infer<typeof getTreatmentPlanDetailInputSchema>;
export type GenerateTreatmentPlanDocumentInput = z.infer<typeof generateTreatmentPlanDocumentInputSchema>;