export const includeSetSections = {
  demographics: "Demographics",
  referrals: "Referrals",
  appointments: "Appointments",
} as const;

export const includeSetKeyLabels: Record<keyof typeof includeSetSections, string> =
  includeSetSections;

export const documentTypes = [
  "PATIENT_RECORD_SUMMARY",
  "APPOINTMENT_SLIP",
  "REFERRAL_LETTER",
] as const;

export type DocumentType = (typeof documentTypes)[number];

export const documentTypeLabels: Record<DocumentType, string> = {
  PATIENT_RECORD_SUMMARY: "Patient record summary",
  APPOINTMENT_SLIP: "Appointment slip",
  REFERRAL_LETTER: "Referral letter",
};

export const documentTypeIncludeSetKeys: Record<
  DocumentType,
  readonly (keyof typeof includeSetSections)[]
> = {
  PATIENT_RECORD_SUMMARY: ["demographics", "referrals", "appointments"],
  APPOINTMENT_SLIP: ["demographics", "appointments"],
  REFERRAL_LETTER: ["demographics", "referrals"],
};