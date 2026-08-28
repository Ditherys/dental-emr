import type { PatientDetail } from "@/lib/patients/types";

export const patientSectionKeys = [
  "overview",
  "account",
  "demographics",
  "contacts",
  "relationships",
  "referrals",
  "clinical",
  "intake",
  "files",
] as const;

export type PatientSectionKey = (typeof patientSectionKeys)[number];

export function isPatientSection(value: unknown): value is PatientSectionKey {
  return (
    typeof value === "string" &&
    (patientSectionKeys as readonly string[]).includes(value)
  );
}

export const patientSectionLabels: Record<PatientSectionKey, string> = {
  overview: "Overview",
  account: "Account",
  demographics: "Demographics",
  contacts: "Contacts",
  relationships: "Relationships",
  referrals: "Referrals",
  clinical: "Clinical",
  intake: "Intake",
  files: "Files",
};

export function patientSectionHref(
  patientId: string,
  section: PatientSectionKey,
  branchId: string,
  edit = false,
) {
  const params = new URLSearchParams({ section, branch: branchId });
  if (edit) params.set("edit", "1");
  return `/patients/${patientId}?${params.toString()}`;
}

export function ageFromBirthDate(
  birthDate: string,
  today = new Date(),
): number | null {
  const [year, month, day] = birthDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  let age = today.getFullYear() - year;
  const hasPassedBirthday =
    today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day);
  if (!hasPassedBirthday) age -= 1;
  return age;
}

export function formatBirthDate(birthDate: string): string {
  const date = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return birthDate;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function patientMutationMessage(code: string): string {
  if (code === "STALE_VERSION") {
    return "This record changed while you were editing. Reload it before making further changes.";
  }
  if (code === "NOT_AUTHORIZED") {
    return "Your access or selected branch changed. Return to the patient directory and try again.";
  }
  if (code === "INVALID_STATE") {
    return "This action is no longer available for the current record state.";
  }
  if (code === "DUPLICATE_REVIEW_REQUIRED") {
    return "A possible duplicate needs your review before this change can be saved.";
  }
  return "The change could not be saved. Review the fields and try again.";
}

export function patientCandidateInput(
  patient: PatientDetail,
  branchId: string,
  mobile?: string,
  email?: string,
) {
  return {
    actingBranchId: branchId,
    firstName: patient.firstName,
    middleName: patient.middleName ?? undefined,
    lastName: patient.lastName,
    suffix: patient.suffix ?? undefined,
    preferredName: patient.preferredName ?? undefined,
    birthDate: patient.birthDate,
    sexAtRegistration: patient.sexAtRegistration ?? undefined,
    addressLine1: patient.addressLine1 ?? undefined,
    addressLine2: patient.addressLine2 ?? undefined,
    city: patient.city ?? undefined,
    province: patient.province ?? undefined,
    postalCode: patient.postalCode ?? undefined,
    initialMobile: mobile,
    initialEmail: email,
  };
}

export function patientDisplayName(patient: PatientDetail) {
  return [patient.firstName, patient.middleName, patient.lastName, patient.suffix]
    .filter(Boolean)
    .join(" ");
}

export type DuplicateRequest = {
  kind: "demographics" | "contact";
  reviewInput: Record<string, unknown>;
  submit: (confirmed: boolean) => Promise<void>;
};
