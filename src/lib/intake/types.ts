import type { z } from "zod";

import type {
  createIntakeFormInputSchema,
  getIntakeFormInputSchema,
  intakeFormDetailSchema,
  intakeFormTypeSchema,
  intakeFormStatusSchema,
  intakeSubmittedViaSchema,
  listConsentTemplatesInputSchema,
  listIntakeFormsInputSchema,
  markIntakeFormPaperInputSchema,
  submitIntakeFormInputSchema,
} from "./schema";

export type IntakeFormType = z.infer<typeof intakeFormTypeSchema>;
export type IntakeFormStatus = z.infer<typeof intakeFormStatusSchema>;
export type IntakeSubmittedVia = z.infer<typeof intakeSubmittedViaSchema>;

export type CreateIntakeFormInput = z.infer<typeof createIntakeFormInputSchema>;
export type GetIntakeFormInput = z.infer<typeof getIntakeFormInputSchema>;
export type SubmitIntakeFormInput = z.infer<typeof submitIntakeFormInputSchema>;
export type MarkIntakeFormPaperInput = z.infer<typeof markIntakeFormPaperInputSchema>;
export type ListIntakeFormsInput = z.infer<typeof listIntakeFormsInputSchema>;
export type ListConsentTemplatesInput = z.infer<typeof listConsentTemplatesInputSchema>;

export type IntakeFormLink = {
  formId: string;
  version: number;
  token: string;
  expiresAt: string;
};

export type IntakeFormSummary = {
  formId: string;
  formType: IntakeFormType;
  templateVersion: string;
  status: IntakeFormStatus;
  submittedVia: IntakeSubmittedVia | null;
  submittedAt: string | null;
  signedAt: string | null;
  createdAt: string;
  version: number;
};

export type IntakeFormDetail = z.infer<typeof intakeFormDetailSchema>;

export type IntakeSubmitResult = {
  formId: string;
  status: IntakeFormStatus;
  submittedAt: string | null;
};

export type ConsentTemplateOption = {
  templateId: string;
  code: string;
  name: string;
  version: number;
};