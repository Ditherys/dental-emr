export type ProviderType = "REGULAR" | "PART_TIME" | "VISITING" | "ON_CALL" | "EXTERNAL_REFERRAL";
export type ProviderStatus = "active" | "inactive" | "archived";

export type ProviderListItem = {
  providerId: string;
  displayName: string;
  providerType: ProviderType;
  status: ProviderStatus;
  websiteVisible: boolean;
  primarySpecialtyLabel: string | null;
  branchCount: number;
};

export type ProviderDetail = {
  providerId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  professionalTitle: string | null;
  licenseNumber: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  providerType: ProviderType;
  status: ProviderStatus;
  websiteVisible: boolean;
  bio: string | null;
  version: number;
  branchIds: string[];
  specialties: { specialtyId: string; isPrimary: boolean }[];
};

export type Specialty = {
  specialtyId: string;
  code: string;
  name: string;
  isActive: boolean;
  isGlobal: boolean;
  version: number;
};

export type ProviderMutationResult = { providerId: string; version: number };
export type SpecialtyMutationResult = { specialtyId: string; version: number };
