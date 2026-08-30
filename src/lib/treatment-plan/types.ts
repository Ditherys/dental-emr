import type { z } from "zod";

import type {
  acknowledgeTreatmentPlanInputSchema,
  addTreatmentPlanAlternativeInputSchema,
  addTreatmentPlanDiscussionInputSchema,
  addTreatmentPlanItemInputSchema,
  createTreatmentPlanInputSchema,
  completeTreatmentInputSchema,
  bridgeCompletionPayloadSchema,
  generateTreatmentPlanDocumentInputSchema,
  getTreatmentPlanDetailInputSchema,
  getTreatmentPlanCompletionContextInputSchema,
  listTreatmentPlansInputSchema,
  presentTreatmentPlanInputSchema,
  removeTreatmentPlanItemInputSchema,
  treatmentPlanAlternativeJsonSchema,
  treatmentPlanDetailJsonSchema,
  treatmentPlanCompletionContextJsonSchema,
  treatmentPlanDiscussionJsonSchema,
  treatmentPlanItemJsonSchema,
  treatmentPlanJsonSchema,
  treatmentPlanStatusSchema,
  implantCompletionPayloadSchema,
  updateTreatmentPlanInputSchema,
  updateTreatmentPlanItemInputSchema,
} from "./schema";

export type TreatmentPlanStatus = z.infer<typeof treatmentPlanStatusSchema>;
export type BridgeCompletionPayload = z.infer<typeof bridgeCompletionPayloadSchema>;
export type ImplantCompletionPayload = z.infer<typeof implantCompletionPayloadSchema>;
export type CompleteTreatmentInput = z.infer<typeof completeTreatmentInputSchema>;
export type CompleteTreatmentResult = { caseId: string; chargeId: string; clinicalEntryId: string | null; bridgeId: string | null; implantComponentId: string | null };

export type TreatmentPlan = {
  planId: string;
  title: string;
  status: TreatmentPlanStatus;
  version: number;
  createdAt: string;
  itemCount: number;
};

export type TreatmentPlanDetailPlan = z.infer<typeof treatmentPlanJsonSchema>;
export type TreatmentPlanItem = z.infer<typeof treatmentPlanItemJsonSchema>;
export type TreatmentPlanAlternative = z.infer<typeof treatmentPlanAlternativeJsonSchema>;
export type TreatmentPlanDiscussion = z.infer<typeof treatmentPlanDiscussionJsonSchema>;
export type TreatmentPlanDetail = z.infer<typeof treatmentPlanDetailJsonSchema>;
export type TreatmentPlanCompletionContext = z.infer<typeof treatmentPlanCompletionContextJsonSchema>;

export type TreatmentPlanMutationResult = { planId: string; version: number };
export type TreatmentPlanItemMutationResult = { itemId: string; lineNo: number };
export type TreatmentPlanAlternativeMutationResult = { alternativeId: string; alternativeNo: number };
export type TreatmentPlanDiscussionMutationResult = { discussionId: string; discussedAt: string };

export type CreateTreatmentPlanInput = z.infer<typeof createTreatmentPlanInputSchema>;
export type UpdateTreatmentPlanInput = z.infer<typeof updateTreatmentPlanInputSchema>;
export type PresentTreatmentPlanInput = z.infer<typeof presentTreatmentPlanInputSchema>;
export type AcknowledgeTreatmentPlanInput = z.infer<typeof acknowledgeTreatmentPlanInputSchema>;
export type AddTreatmentPlanItemInput = z.infer<typeof addTreatmentPlanItemInputSchema>;
export type UpdateTreatmentPlanItemInput = z.infer<typeof updateTreatmentPlanItemInputSchema>;
export type RemoveTreatmentPlanItemInput = z.infer<typeof removeTreatmentPlanItemInputSchema>;
export type AddTreatmentPlanAlternativeInput = z.infer<typeof addTreatmentPlanAlternativeInputSchema>;
export type AddTreatmentPlanDiscussionInput = z.infer<typeof addTreatmentPlanDiscussionInputSchema>;
export type ListTreatmentPlansInput = z.infer<typeof listTreatmentPlansInputSchema>;
export type GetTreatmentPlanDetailInput = z.infer<typeof getTreatmentPlanDetailInputSchema>;
export type GetTreatmentPlanCompletionContextInput = z.infer<typeof getTreatmentPlanCompletionContextInputSchema>;
export type GenerateTreatmentPlanDocumentInput = z.infer<typeof generateTreatmentPlanDocumentInputSchema>;
