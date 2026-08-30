import type { z } from "zod";

import type {
  amendCurrentBridgeInputSchema,
  amendCurrentImplantComponentInputSchema,
  amendPeriodontalExaminationInputSchema,
  amendToothClinicalEntryInputSchema,
  bridgeMutationRowSchema,
  bridgeUnitSchema,
  clinicalFeatureDetailSchema,
  completeTreatmentPlanItemWithChargeInputSchema,
  correctTreatmentPlanItemExecutionInputSchema,
  createPeriodontalExaminationInputSchema,
  createPlanBridgeDesignInputSchema,
  createPlanImplantDesignInputSchema,
  createToothConditionInputSchema,
  dentalBridgeDataSchema,
  dentalImplantChainComponentDataSchema,
  dentalImplantChainDataSchema,
  finalizePeriodontalExaminationInputSchema,
  getPatientOdontogramInputSchema,
  implantComponentPayloadSchema,
  implantMutationRowSchema,
  legacyReconciliationFlagDataSchema,
  legacyResolutionRowSchema,
  listToothConditionsInputSchema,
  periodontalExaminationDataSchema,
  periodontalSaveRowSchema,
  recordCurrentBridgeInputSchema,
  recordCurrentImplantComponentInputSchema,
  recordToothClinicalEntryInputSchema,
  resolveLegacyOdontogramEntryInputSchema,
  savePeriodontalMeasurementsInputSchema,
  toothClinicalEntryDataSchema,
  toothClinicalSurfaceSchema,
  toothClinicalEntryMutationRowSchema,
  toothFindingTypeSchema,
  toothStatusSchema,
  toothSurfaceSchema,
  transitionTreatmentPlanItemExecutionInputSchema,
  treatmentExecutionCompleteRowSchema,
  treatmentExecutionDataSchema,
  treatmentExecutionTransitionRowSchema,
  updateDraftPlanBridgeDesignInputSchema,
  updateDraftPlanImplantDesignInputSchema,
  voidCurrentBridgeInputSchema,
  voidCurrentImplantComponentInputSchema,
  voidToothClinicalEntryInputSchema,
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

// ---------------------------------------------------------------------------
// O5 DTOs
// ---------------------------------------------------------------------------

export type ToothClinicalEntryDTO = z.infer<typeof toothClinicalEntryDataSchema>;
export type ToothClinicalSurface = z.infer<typeof toothClinicalSurfaceSchema>;
export type ClinicalFeatureDetail = z.infer<typeof clinicalFeatureDetailSchema>;

export type PatientOdontogramDTO = {
  patientId: string;
  entries: ToothClinicalEntryDTO[];
  bridges: DentalBridgeDTO[];
  implantChains: DentalImplantChainDTO[];
  periodontalExaminations: PeriodontalExaminationDTO[];
  legacyReconciliationFlags: LegacyReconciliationFlagDTO[];
  treatmentExecutions: TreatmentExecutionDTO[];
};

export type ToothClinicalEntryMutationResult = z.infer<typeof toothClinicalEntryMutationRowSchema>;
export type LegacyResolutionResult = z.infer<typeof legacyResolutionRowSchema>;

export type BridgeUnitDTO = z.infer<typeof bridgeUnitSchema>;
export type BridgeMutationResult = z.infer<typeof bridgeMutationRowSchema>;

type DentalBridgeData = z.infer<typeof dentalBridgeDataSchema>;
export type DentalBridgeDTO = Omit<DentalBridgeData, "id"> & { bridgeId: string };

export type ImplantComponentPayloadDTO = z.infer<typeof implantComponentPayloadSchema>;
export type ImplantMutationResult = z.infer<typeof implantMutationRowSchema>;

export type DentalImplantChainDTO = z.infer<typeof dentalImplantChainDataSchema>;
type DentalImplantChainComponentData = z.infer<typeof dentalImplantChainComponentDataSchema>;
type DentalImplantChainRootData = Omit<DentalImplantChainDTO, "components" | "event_state">;
export type DentalImplantComponentDTO = Omit<DentalImplantChainComponentData, "id"> &
  DentalImplantChainRootData & { componentId: string };

export type PeriodontalExaminationDTO = z.infer<typeof periodontalExaminationDataSchema>;
export type LegacyReconciliationFlagDTO = z.infer<typeof legacyReconciliationFlagDataSchema>;
export type TreatmentExecutionDTO = z.infer<typeof treatmentExecutionDataSchema>;

export type PeriodontalSaveResult = z.infer<typeof periodontalSaveRowSchema>;

export type TreatmentExecutionTransitionResult = z.infer<typeof treatmentExecutionTransitionRowSchema>;
export type TreatmentExecutionCompleteResult = z.infer<typeof treatmentExecutionCompleteRowSchema>;

// Input type exports

export type GetPatientOdontogramInput = z.infer<typeof getPatientOdontogramInputSchema>;
export type RecordToothClinicalEntryInput = z.infer<typeof recordToothClinicalEntryInputSchema>;
export type AmendToothClinicalEntryInput = z.infer<typeof amendToothClinicalEntryInputSchema>;
export type VoidToothClinicalEntryInput = z.infer<typeof voidToothClinicalEntryInputSchema>;
export type ResolveLegacyOdontogramEntryInput = z.infer<typeof resolveLegacyOdontogramEntryInputSchema>;

export type CreatePlanBridgeDesignInput = z.infer<typeof createPlanBridgeDesignInputSchema>;
export type UpdateDraftPlanBridgeDesignInput = z.infer<typeof updateDraftPlanBridgeDesignInputSchema>;
export type RecordCurrentBridgeInput = z.infer<typeof recordCurrentBridgeInputSchema>;
export type AmendCurrentBridgeInput = z.infer<typeof amendCurrentBridgeInputSchema>;
export type VoidCurrentBridgeInput = z.infer<typeof voidCurrentBridgeInputSchema>;

export type CreatePlanImplantDesignInput = z.infer<typeof createPlanImplantDesignInputSchema>;
export type UpdateDraftPlanImplantDesignInput = z.infer<typeof updateDraftPlanImplantDesignInputSchema>;
export type RecordCurrentImplantComponentInput = z.infer<typeof recordCurrentImplantComponentInputSchema>;
export type AmendCurrentImplantComponentInput = z.infer<typeof amendCurrentImplantComponentInputSchema>;
export type VoidCurrentImplantComponentInput = z.infer<typeof voidCurrentImplantComponentInputSchema>;

export type CreatePeriodontalExaminationInput = z.infer<typeof createPeriodontalExaminationInputSchema>;
export type SavePeriodontalMeasurementsInput = z.infer<typeof savePeriodontalMeasurementsInputSchema>;
export type FinalizePeriodontalExaminationInput = z.infer<typeof finalizePeriodontalExaminationInputSchema>;
export type AmendPeriodontalExaminationInput = z.infer<typeof amendPeriodontalExaminationInputSchema>;

export type TransitionTreatmentPlanItemExecutionInput = z.infer<typeof transitionTreatmentPlanItemExecutionInputSchema>;
export type CompleteTreatmentPlanItemWithChargeInput = z.infer<typeof completeTreatmentPlanItemWithChargeInputSchema>;
export type CorrectTreatmentPlanItemExecutionInput = z.infer<typeof correctTreatmentPlanItemExecutionInputSchema>;
