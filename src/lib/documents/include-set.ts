export const includeSetSections = {
  demographics: "Demographics",
  referrals: "Referrals",
  appointments: "Appointments",
  items: "Items",
  alternatives: "Alternatives",
  discussions: "Discussions",
  drawing: "Drawing",
} as const;

export const includeSetKeyLabels: Record<keyof typeof includeSetSections, string> =
  includeSetSections;

export const documentTypes = [
  "PATIENT_RECORD_SUMMARY",
  "APPOINTMENT_SLIP",
  "REFERRAL_LETTER",
  "TREATMENT_PLAN",
] as const;

export type DocumentType = (typeof documentTypes)[number];

export const documentTypeLabels: Record<DocumentType, string> = {
  PATIENT_RECORD_SUMMARY: "Patient record summary",
  APPOINTMENT_SLIP: "Appointment slip",
  REFERRAL_LETTER: "Referral letter",
  TREATMENT_PLAN: "Treatment plan",
};

export const documentTypeIncludeSetKeys: Record<
  DocumentType,
  readonly (keyof typeof includeSetSections)[]
> = {
  PATIENT_RECORD_SUMMARY: ["demographics", "referrals", "appointments"],
  APPOINTMENT_SLIP: ["demographics", "appointments"],
  REFERRAL_LETTER: ["demographics", "referrals"],
  TREATMENT_PLAN: ["items", "alternatives", "discussions", "drawing"],
};

// The general documents board generates only the non-plan types: TREATMENT_PLAN
// documents are generated from a specific acknowledged/presented plan inside
// the patient treatment-plan section, which carries the plan selector the
// board does not have.
export const boardGeneratableDocumentTypes = [
  "PATIENT_RECORD_SUMMARY",
  "APPOINTMENT_SLIP",
  "REFERRAL_LETTER",
] as const;