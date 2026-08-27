import type { z } from "zod";

import type {
  appointmentSnapshotSchema,
  documentDataSnapshotSchema,
  documentTypeSchema,
  getDocumentSnapshotInputSchema,
  generateDocumentInputSchema,
  listDocumentsInputSchema,
  patientDemographicsSnapshotSchema,
  patientReferralSnapshotSchema,
  treatmentPlanAlternativeSnapshotSchema,
  treatmentPlanDrawingSnapshotSchema,
  treatmentPlanDiscussionSnapshotSchema,
  treatmentPlanItemSnapshotSchema,
  treatmentPlanSnapshotSchema,
} from "./schema";

export type DocumentType = z.infer<typeof documentTypeSchema>;

export type PatientDemographicsSnapshot = z.infer<typeof patientDemographicsSnapshotSchema>;
export type PatientReferralSnapshot = z.infer<typeof patientReferralSnapshotSchema>;
export type AppointmentSnapshot = z.infer<typeof appointmentSnapshotSchema>;
export type TreatmentPlanSnapshot = z.infer<typeof treatmentPlanSnapshotSchema>;
export type TreatmentPlanItemSnapshot = z.infer<typeof treatmentPlanItemSnapshotSchema>;
export type TreatmentPlanAlternativeSnapshot = z.infer<typeof treatmentPlanAlternativeSnapshotSchema>;
export type TreatmentPlanDiscussionSnapshot = z.infer<typeof treatmentPlanDiscussionSnapshotSchema>;
export type TreatmentPlanDrawingSnapshot = z.infer<typeof treatmentPlanDrawingSnapshotSchema>;
export type DocumentDataSnapshot = z.infer<typeof documentDataSnapshotSchema>;

export type GenerateDocumentInput = z.infer<typeof generateDocumentInputSchema>;
export type ListDocumentsInput = z.infer<typeof listDocumentsInputSchema>;
export type GetDocumentSnapshotInput = z.infer<typeof getDocumentSnapshotInputSchema>;

export type DocumentRecord = {
  documentId: string;
  documentType: DocumentType;
  templateVersion: string;
  includeSet: Record<string, boolean | string>;
  generatedBy: string | null;
  generatedAt: string;
  version: number;
};

export type DocumentSnapshot = {
  documentId: string;
  documentType: DocumentType;
  templateVersion: string;
  dataSnapshot: DocumentDataSnapshot;
  version: number;
};

export type DocumentMutationResult = {
  documentId: string;
  version: number;
};

export type DocumentRenderInput = {
  documentType: DocumentType;
  templateVersion: string;
  dataSnapshot: DocumentDataSnapshot;
  orgName: string;
  branchName: string;
};