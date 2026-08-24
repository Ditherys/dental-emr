export type DuplicateSignal = "NAME_DOB" | "MOBILE" | "EMAIL";

export type DuplicateCandidate = {
  patientId: string;
  patientNumber: string;
  displayName: string;
  birthDate: string;
  status: "active" | "inactive" | "archived";
  matchedSignals: DuplicateSignal[];
};

export type DuplicateReview = {
  candidates: DuplicateCandidate[];
  truncated: boolean;
};

export type PatientDemographicsInput = {
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  preferredName?: string;
  birthDate: string;
  sexAtRegistration?: "female" | "male" | "intersex" | "unknown" | "not_recorded";
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  preferredBranchId?: string;
};

export type CreatePatientInput = PatientDemographicsInput & {
  actingBranchId: string;
  initialMobile?: string;
  initialEmail?: string;
  duplicateConfirmed: boolean;
};

export type CreatePatientResult = {
  patientId: string;
  version: number;
};
