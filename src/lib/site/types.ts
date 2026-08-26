export type PublicSiteProvider = {
  displayName: string;
  bio: string | null;
  primarySpecialtyLabel: string | null;
};

export type PublicSiteProcedure = {
  name: string;
  description: string | null;
};

export type PublicSite = {
  organizationName: string | null;
  address: string | null;
  heroHeading: string | null;
  heroSubtext: string | null;
  aboutText: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  addressOverride: string | null;
  operatingHours: Record<string, string>;
  privacyNotice: string | null;
  messengerLink: string | null;
  bookingLink: string | null;
  socialLinks: Record<string, string>;
  providers: PublicSiteProvider[];
  procedures: PublicSiteProcedure[];
};

export type PublicSiteSettings = {
  heroHeading: string | null;
  heroSubtext: string | null;
  aboutText: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  addressOverride: string | null;
  operatingHours: Record<string, string>;
  privacyNotice: string | null;
  messengerLink: string | null;
  bookingLink: string | null;
  socialLinks: Record<string, string>;
  version: number;
};

export type UpdatePublicSiteSettingsResult = {
  organizationId: string;
  version: number;
};