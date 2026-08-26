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
  acquisitionSourceId?: string;
  referrerPatientId?: string;
  externalReferrerName?: string;
  externalReferrerOrganization?: string;
  externalReferrerContact?: string;
  initialBookingChannelCode?: string;
  duplicateConfirmed: boolean;
};

export type CreatePatientResult = {
  patientId: string;
  version: number;
};

export type PatientDemographicsPatch = {
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  suffix?: string | null;
  preferredName?: string | null;
  birthDate?: string;
  sexAtRegistration?: "female" | "male" | "intersex" | "unknown" | "not_recorded" | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  preferredBranchId?: string | null;
};

export type UpdatePatientInput = PatientDemographicsPatch & {
  patientId: string;
  actingBranchId: string;
  expectedVersion: number;
  duplicateConfirmed: boolean;
};

export type UpdatePatientResult = {
  patientId: string;
  version: number;
};

export type PatientLifecycleInput = {
  patientId: string;
  actingBranchId: string;
  expectedVersion: number;
};

export type PatientLifecycleResult = UpdatePatientResult;

export type PatientContactInput = {
  patientId: string; actingBranchId: string; contactType: "MOBILE" | "EMAIL" | "LANDLINE" | "OTHER";
  label?: string; value: string; isPrimary: boolean; duplicateConfirmed: boolean;
};
export type UpdatePatientContactInput = PatientContactInput & { contactId: string; expectedVersion: number };
export type PatientRelationshipInput = {
  patientId: string; actingBranchId: string; relatedPatientId?: string; externalContactName?: string;
  externalMobile?: string; externalEmail?: string; relationshipType: PatientRelationshipDetail["relationshipType"];
  isLegalGuardian: boolean; canReceiveCommunications: boolean; canConsent: boolean;
};
export type UpdatePatientRelationshipInput = PatientRelationshipInput & { relationshipId: string; expectedVersion: number };
export type PatientContactMutationResult = { contactId: string; version: number };
export type PatientRelationshipMutationResult = { relationshipId: string; version: number };

export type PatientListQuery = {
  actingBranchId: string;
  query?: string;
  birthDate?: string;
  status?: "active" | "inactive" | "archived";
  sort: "name_asc" | "name_desc" | "patient_number_asc" | "updated_desc";
  page: number;
  pageSize: number;
};

export type PatientListItem = {
  patientId: string;
  patientNumber: string;
  displayName: string;
  birthDate: string;
  primaryMobile: string | null;
  primaryEmail: string | null;
  status: "active" | "inactive" | "archived";
};

export type PatientDetail = {
  patientId: string;
  patientNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  preferredName: string | null;
  sexAtRegistration: "female" | "male" | "intersex" | "unknown" | "not_recorded" | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  preferredBranch: { branchId: string; name: string } | null;
  birthDate: string;
  status: "active" | "inactive" | "archived";
  version: number;
  attribution: {
    acquisitionSource: { code: string; name: string; category: "REFERRAL" | "DIGITAL" | "TRADITIONAL" | "PARTNER" | "OTHER" | "UNKNOWN" } | null;
    initialBookingChannel: { code: string; name: string } | null;
    referrerPatient: { patientId: string; displayName: string } | null;
    externalReferrer: { name: string | null; organization: string | null; contact: string | null };
  };
  contacts: PatientContactDetail[];
  relationships: PatientRelationshipDetail[];
};

export type PatientContactDetail = {
  contactId: string;
  contactType: "MOBILE" | "EMAIL" | "LANDLINE" | "OTHER";
  label: string | null;
  value: string;
  isPrimary: boolean;
  version: number;
};

export type PatientRelationshipDetail = {
  relationshipId: string;
  relatedPatientId: string | null;
  relatedPatientDisplayName: string | null;
  externalContactName: string | null;
  externalMobile: string | null;
  externalEmail: string | null;
  relationshipType: "PARENT" | "GUARDIAN" | "CHILD" | "SPOUSE" | "DEPENDENT" | "EMERGENCY_CONTACT" | "HOUSEHOLD_CONTACT" | "OTHER";
  isLegalGuardian: boolean;
  canReceiveCommunications: boolean;
  canConsent: boolean;
  version: number;
};
