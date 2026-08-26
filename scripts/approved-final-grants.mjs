/**
 * THE APPROVED FINAL PRIVILEGE SET FOR THE SECURE MIGRATION CHAIN.
 *
 * This file is the human-readable authority the R6-B static lint compares the
 * grant-terminal migration against. It is intentionally verbose: every entry
 * carries the reason it exists, so adding, widening, or removing a privilege
 * produces a review-visible diff that states what changed and why.
 *
 * RULES FOR EDITING THIS FILE
 *
 *   1. Do not add an entry to make a failing lint pass. The lint failing means a
 *      migration changed the effective privilege set; decide whether that change
 *      is approved before recording it here.
 *   2. Every entry needs a `reason` that answers "why may this role hold this
 *      privilege?", not "what does this privilege do?".
 *   3. Grants to `authenticated` / `anon` / PUBLIC are security decisions.
 *      Adding one requires the same review as a migration.
 *   4. The comparison is exact in both directions. An approved entry the
 *      migration no longer grants also fails, because a stale allowlist is a
 *      false record of the security boundary.
 *
 * A registered grant whose object signature a later reviewed migration replaced
 * carries a `supersededBy` field naming the replacement object and a
 * `supersededFrom` field naming the registered terminal migration that revokes
 * it. It still matches the immutable historical terminal file statically.
 * Because R6-D replays assert the final-boundary comparison at EVERY
 * intermediate file boundary, replay expectations include the old signature
 * until its revoking migration has been applied and exclude it from that
 * boundary onward — and from the end-of-chain final state — where the
 * superseded privilege no longer exists in the live catalog.
 *
 * See docs/decisions/ADR-017-phase1-secure-migration-baseline.md.
 */

import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");

export const MIGRATIONS_DIRECTORY = "supabase/migrations";

const FOUNDATION_TABLES = Object.freeze([
  ["public.organizations", "Tenancy root. RLS restricts it to organizations the caller is an active member of."],
  ["public.branches", "Branch directory. RLS restricts it to branches the caller can access."],
  ["public.profiles", "Workforce profiles. RLS restricts it to the caller's own row plus rows an organization manager may see."],
  ["public.organization_members", "Membership edges, needed to render the caller's own organization context."],
  ["public.roles", "Role catalog, needed to render authorization state in the EMR shell."],
  ["public.permissions", "Permission catalog, needed to render authorization state in the EMR shell."],
  ["public.role_permissions", "Role-to-permission edges, needed to derive effective permissions client-side for UX only."],
  ["public.branch_memberships", "Branch access edges, needed for the branch selector."],
  ["public.member_roles", "Role assignments, needed to render authorization state."],
  ["public.audit_events", "Audit trail. RLS restricts it to events the caller is authorized to read."],
]);

const RLS_HELPERS = Object.freeze([
  "private.is_active_org_member(uuid)",
  "private.has_org_permission(uuid, text)",
  "private.has_branch_access(uuid)",
  "private.has_branch_permission(uuid, text)",
  "private.is_own_organization_member(uuid)",
]);

const ADMINISTRATIVE_RPCS = Object.freeze([
  "public.create_branch(uuid, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, boolean)",
  "public.set_role_permission(uuid, text, boolean)",
  "public.set_member_role(uuid, uuid, uuid, boolean)",
  "public.set_branch_membership(uuid, uuid, text)",
  "public.update_organization_member_status(uuid, text)",
  "public.record_mfa_enrollment(uuid)",
]);

const SERVER_ONLY_INVITATION_FUNCTIONS = Object.freeze([
  "public.list_workforce_invitation_options(uuid)",
  "public.prepare_workforce_invitation(uuid, uuid, uuid, text, uuid, uuid)",
  "public.prepare_first_owner_invitation(uuid, uuid, text)",
  "public.finalize_workforce_invitation(uuid, uuid, uuid)",
  "public.fail_workforce_invitation(uuid)",
  "public.get_workforce_invitation_summary(uuid)",
  "public.accept_workforce_invitation(uuid, text, text)",
  "public.revoke_workforce_invitation(uuid, uuid)",
]);

/**
 * The only self-service write path any browser-reachable role holds anywhere in
 * the baseline. Constrained by the `profiles_update_self` policy to the caller's
 * own row. None of these columns carries authorization meaning.
 */
const SELF_SERVICE_PROFILE_COLUMNS = Object.freeze([
  "display_name",
  "first_name",
  "last_name",
  "mobile",
  "avatar_object_key",
]);

const FINAL_GRANTS_MIGRATION = "20260813020700_baseline_final_grants.sql";

const finalGrants = [
  ...FOUNDATION_TABLES.map(([object, why]) => ({
    grantee: "authenticated",
    objectClass: "table",
    object,
    privilege: "select",
    columns: [],
    reason: `Read-only, RLS-filtered. ${why} No INSERT, UPDATE, or DELETE is granted anywhere in the baseline.`,
  })),

  {
    grantee: "authenticated",
    objectClass: "table",
    object: "public.profiles",
    privilege: "update",
    columns: [...SELF_SERVICE_PROFILE_COLUMNS],
    reason:
      "The single self-service write path. Column-scoped to five non-authorization profile fields and row-scoped by the profiles_update_self policy, so it cannot alter organization, branch, role, permission, or status state.",
  },

  ...RLS_HELPERS.map((object) => ({
    grantee: "authenticated",
    objectClass: "function",
    object,
    privilege: "execute",
    columns: [],
    reason:
      "Required only so the stored RLS policy expressions that call this helper can be evaluated in the caller's session. USAGE on the private schema is revoked, so it is not reachable as a Data API RPC.",
  })),

  ...ADMINISTRATIVE_RPCS.map((object) => ({
    grantee: "authenticated",
    objectClass: "function",
    object,
    privilege: "execute",
    columns: [],
    reason:
      "The sole administrative mutation path. The function calls private.require_aal2() first, takes the organization-scoped advisory lock, re-derives authorization from the current user context, enforces anti-self-escalation and permission-superset checks, and emits an audit event in the same transaction.",
  })),

  ...SERVER_ONLY_INVITATION_FUNCTIONS.map((object) => ({
    grantee: "service_role",
    objectClass: "function",
    object,
    privilege: "execute",
    columns: [],
    reason:
      "Server-only invitation boundary, called exclusively by the server-side service client. service_role's secret key must never reach browser code, so this is not a browser-reachable privilege.",
  })),
];

const BRANCH_LIFECYCLE_MIGRATION = "20260818010000_branch_update_and_archive.sql";

const BRANCH_LIFECYCLE_RPCS = Object.freeze([
  "public.update_branch(uuid, text, text, text, text, text, text, text, text, text, boolean)",
  "public.archive_branch(uuid)",
]);

const branchLifecycleGrants = BRANCH_LIFECYCLE_RPCS.map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  reason:
    "The sole branch update/archive mutation path (H-5). Derives organization_id from the target branch row (never accepted from the client), calls private.require_aal2() first, takes the organization-scoped advisory lock, re-derives authorization from the current user context, and emits an audit event in the same transaction.",
}));

const PATIENT_PERMISSION_CONTRACT_MIGRATION =
  "20260819010100_patient_permission_contract_grants.sql";

const patientPermissionContractGrants = Object.freeze([
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.set_member_role(uuid, uuid, uuid, boolean)",
    privilege: "execute",
    columns: [],
    reason:
      "Restores the existing browser-callable role-assignment boundary after its P2-01 authorization body is replaced. The RPC still requires AAL2, role.manage, tenant/branch validation, anti-self-assignment, a live bounded delegation predicate, organization locking, and atomic audit.",
  },
  ...[
    "public.list_workforce_invitation_options(uuid)",
    "public.prepare_workforce_invitation(uuid, uuid, uuid, text, uuid, uuid)",
    "public.finalize_workforce_invitation(uuid, uuid, uuid)",
  ].map((object) => ({
    grantee: "service_role",
    objectClass: "function",
    object,
    privilege: "execute",
    columns: [],
    reason:
      "Restores the existing server-only invitation boundary after P2-01 applies the shared bounded delegation predicate and invitation anti-self checks. No browser-reachable role receives this privilege.",
  })),
]);

const PATIENT_IDENTITY_GRANTS_MIGRATION =
  "20260824010100_patient_identity_grants.sql";

const patientIdentityGrants = Object.freeze([
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "private.has_shared_patient_permission(uuid, text)",
    privilege: "execute",
    columns: [],
    reason:
      "Required only so the stored patients_select_shared_directory RLS expression can evaluate live organization-wide or active exact-branch patient permission. USAGE on private remains revoked, and no patient-table privilege or Data API RPC is granted.",
  },
]);

const PATIENT_CREATE_GRANTS_MIGRATION =
  "20260825010200_patient_create_grants.sql";

const patientCreateGrants = Object.freeze([
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.find_duplicate_candidates(uuid, text, text, date, text, text)",
    privilege: "execute",
    columns: [],
    reason:
      "The bounded duplicate-review RPC derives tenant and actor from the authenticated acting-branch context, requires live patient write permission, and returns only the approved minimal candidate projection.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.create_patient(uuid, text, text, text, text, text, date, text, text, text, text, text, text, uuid, text, text, boolean)",
    privilege: "execute",
    columns: [],
    reason:
      "The original patient creation boundary remains executable for backward-compatible calls. It derives actor and tenant from the authenticated acting branch, locks duplicate/counter state, validates and rechecks duplicates, creates contacts and patient atomically, and appends one patient-linked audit event.",
  },
]);

const PATIENT_READS_GRANTS_MIGRATION =
  "20260825010400_patient_reads_grants.sql";

const patientReadsGrants = Object.freeze([
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.search_patients(uuid, text, date, text, text, integer, integer)",
    privilege: "execute",
    columns: [],
    reason:
      "The bounded patient-directory RPC derives tenant and actor from an authenticated acting branch, requires live demographics-read permission, and returns only the approved paginated list projection.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.get_patient_detail(uuid, uuid)",
    privilege: "execute",
    columns: [],
    reason:
      "The bounded patient-detail RPC derives tenant from the target plus authenticated acting branch, requires live demographics-read permission, and records one opaque patient.viewed audit event atomically before returning.",
  },
]);

const PATIENT_DEMOGRAPHICS_WRITE_GRANTS_MIGRATION =
  "20260825010600_patient_demographics_write_grants.sql";

const patientDemographicsWriteGrants = Object.freeze([
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.update_patient(uuid, uuid, integer, jsonb, boolean)",
    privilege: "execute",
    columns: [],
    reason:
      "The only patient demographics update path. It derives the target tenant and actor from trusted rows and authenticated context, validates PATCH semantics and preferred-branch access, locks duplicate state and the patient version, and appends one opaque audit event atomically.",
  },
]);

const PATIENT_CHILDREN_WRITE_GRANTS_MIGRATION = "20260825010800_patient_children_write_grants.sql";
const patientChildrenWriteGrants = Object.freeze([
  "public.create_patient_contact(uuid,uuid,text,text,text,boolean,boolean)",
  "public.update_patient_contact(uuid,uuid,uuid,integer,text,text,text,boolean,boolean)",
  "public.archive_patient_contact(uuid,uuid,uuid,integer)",
  "public.create_patient_relationship(uuid,uuid,uuid,text,text,text,text,boolean,boolean,boolean)",
  "public.update_patient_relationship(uuid,uuid,uuid,integer,uuid,text,text,text,text,boolean,boolean,boolean)",
  "public.archive_patient_relationship(uuid,uuid,uuid,integer)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only patient child mutation path. It derives the tenant, parent, and actor from trusted authenticated context, rechecks live write permission, applies row/advisory locking and optimistic versions, and appends one opaque patient-linked audit event atomically." })));

const PATIENT_LIFECYCLE_GRANTS_MIGRATION = "20260825011000_patient_lifecycle_grants.sql";
const patientLifecycleGrants = Object.freeze([
  "public.archive_patient(uuid, uuid, integer)",
  "public.reactivate_patient(uuid, uuid, integer)",
  "public.search_patients(uuid, text, date, text, text, integer, integer)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only patient lifecycle mutation path. It requires AAL2, derives tenant and actor from trusted authenticated target/branch context, rechecks live write permission, locks the patient version, and appends one opaque patient-linked audit event atomically." })));

const PROVIDER_MUTATIONS_GRANTS_MIGRATION = "20260826010201_provider_mutations_grants.sql";
const providerMutationGrants = Object.freeze([
  "public.create_provider(uuid, jsonb)",
  "public.update_provider(uuid, uuid, integer, jsonb)",
  "public.archive_provider(uuid, uuid, integer)",
  "public.create_specialty(uuid, text, text)",
  "public.update_specialty(uuid, uuid, integer, jsonb)",
  "public.set_provider_branches(uuid, uuid, integer, uuid[])",
  "public.set_provider_specialties(uuid, uuid, integer, jsonb)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only provider configuration mutation path. It derives the tenant and actor from an active authenticated acting branch, requires live organization-wide provider.manage, locks versioned targets, and appends one opaque audit event atomically; archive and linked-user changes also require AAL2." })));

const PROVIDER_READS_GRANTS_MIGRATION = "20260826010301_provider_reads_grants.sql";
const providerReadGrants = Object.freeze([
  "public.list_provider_directory(uuid)",
  "public.get_provider_configuration(uuid, uuid)",
  "public.list_specialties(uuid)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The bounded provider configuration read path derives the tenant from an active authenticated acting branch, requires live organization-wide provider.read, and returns no membership, Auth, scheduling, patient, or audit data." })));

const PROCEDURE_RPCS_GRANTS_MIGRATION = "20260826010501_procedure_rpcs_grants.sql";
const procedureRpcGrants = Object.freeze([
  "public.create_procedure(uuid, jsonb)",
  "public.update_procedure(uuid, uuid, integer, jsonb)",
  "public.archive_procedure(uuid, uuid, integer)",
  "public.set_procedure_specialties(uuid, uuid, integer, jsonb)",
  "public.set_procedure_eligible_providers(uuid, uuid, integer, uuid[])",
  "public.list_procedures(uuid)",
  "public.get_procedure_configuration(uuid, uuid)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only procedure catalog and qualification path derives tenant and actor from an active authenticated acting branch, requires live organization-wide provider.manage for mutations or provider.read for bounded projections, uses optimistic versions, and writes opaque audit events atomically; archive requires AAL2." })));

const PATIENT_FILE_UPLOAD_RPCS_GRANTS_MIGRATION =
  "20260826010701_patient_file_upload_rpcs_grants.sql";

const patientFileUploadRpcGrants = Object.freeze([
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.create_file_upload(uuid,uuid,text,bigint)",
    privilege: "execute",
    columns: [],
    reason:
      "The only patient file upload creation boundary derives tenant and actor from an active authenticated acting branch, requires live demographics-write at the acting branch or organization-wide provider.manage, inserts only pending metadata rows with opaque scoped object keys, and appends one opaque patient-linked audit event atomically; presigned URLs stay in the server-side storage adapter.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.confirm_file_upload(uuid,uuid,integer)",
    privilege: "execute",
    columns: [],
    supersededBy: "public.confirm_file_upload(uuid,uuid,integer,bigint)",
    supersededFrom: "20260826011100_confirm_file_upload_verified_size.sql",
    reason:
      "Historical EXECUTE grant of the immutable 20260826010701 terminal for the original three-argument confirmation signature. Revoked by 20260826011100, which recreated the definition with a fourth required bigint parameter carrying the server-measured object size and revoked both signatures adjacent to recreation; 20260826011101 restores EXECUTE on the replacement signature. Replay boundaries through 20260826011001 legitimately hold this privilege and must expect it; from the revoking boundary onward it no longer exists in the live catalog and is excluded.",
  },
]);

const PATIENT_FILE_CONFIRM_VERIFIED_SIZE_GRANTS_MIGRATION =
  "20260826011101_confirm_file_upload_verified_size_grants.sql";

const PATIENT_FILE_READ_RPCS_GRANTS_MIGRATION =
  "20260826010801_patient_file_read_rpcs_grants.sql";

const patientFileReadRpcGrants = Object.freeze([
  "public.list_patient_files(uuid,uuid,boolean)",
  "public.get_file_metadata(uuid,uuid)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only patient file read boundary derives the tenant from an active authenticated acting branch, requires live demographics-read at the acting branch, and returns only the bounded metadata projection without checksums while writing no audit events; get_file_metadata is the authorization gate the server-side storage adapter reuses before minting a presigned download URL. Its single-file projection was later extended with the opaque object_key by the reviewed P4-07 extension migration." })));

const PATIENT_FILE_ARCHIVE_RPC_GRANTS_MIGRATION =
  "20260826010901_patient_file_archive_rpc_grants.sql";

const patientFileArchiveRpcGrants = Object.freeze([
  "public.archive_file(uuid,uuid,integer)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only patient file archive boundary requires AAL2 first, derives tenant and actor from an active authenticated acting branch, requires live demographics-write at the acting branch or organization-wide provider.manage, flips only metadata status to archived under a locked optimistic version while appending one opaque patient-linked audit event atomically; object-storage deletion stays in the server-side storage adapter." })));

const PATIENT_FILE_METADATA_OBJECT_KEY_GRANTS_MIGRATION =
  "20260826011001_patient_file_metadata_object_key_grants.sql";

const PATIENT_ATTRIBUTION_RPCS_GRANTS_MIGRATION =
  "20260826011401_patient_attribution_rpcs_grants.sql";

const PATIENT_REFERRAL_RPCS_GRANTS_MIGRATION =
  "20260826011601_patient_referral_rpcs_grants.sql";

const ACQUISITION_CATALOG_READS_GRANTS_MIGRATION =
  "20260826011701_acquisition_catalog_reads_grants.sql";

const ACQUISITION_REPORT_GRANTS_MIGRATION =
  "20260826011801_acquisition_report_grants.sql";

const APPOINTMENT_RPCS_GRANTS_MIGRATION =
  "20260827010501_appointment_rpcs_grants.sql";

const appointmentRpcGrants = Object.freeze([
  "public.create_appointment(uuid,uuid,jsonb)",
  "public.reschedule_appointment(uuid,uuid,integer,timestamptz,timestamptz)",
  "public.cancel_appointment(uuid,uuid,integer,text)",
  "public.update_appointment_status(uuid,uuid,integer,text,text,text)",
  "public.list_appointments(uuid,timestamptz,timestamptz,uuid,text)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only appointment scheduling boundary. It derives the tenant and actor from an active authenticated acting branch, requires live appointment.write (create/reschedule/cancel/status) or appointment.read (list), validates providers against active branch assignments and recurring availability with no UNAVAILABLE/LEAVE exception, relies on the reservation-ledger exclusion constraints as the final race protection, and appends one atomic audit event per mutation." })));

/**
 * Grant-terminal migrations, in migration order.
 *
 * Every other migration file must contain no GRANT at all. When a future phase
 * needs new privileges, register its final file here together with its exact
 * approved grant set — that registration is the review gate.
 */
export const TERMINAL_MIGRATIONS = Object.freeze([
  Object.freeze({
    file: FINAL_GRANTS_MIGRATION,
    grants: Object.freeze(finalGrants),
  }),
  Object.freeze({
    file: BRANCH_LIFECYCLE_MIGRATION,
    grants: Object.freeze(branchLifecycleGrants),
  }),
  Object.freeze({
    file: PATIENT_PERMISSION_CONTRACT_MIGRATION,
    grants: patientPermissionContractGrants,
  }),
  Object.freeze({
    file: PATIENT_IDENTITY_GRANTS_MIGRATION,
    grants: patientIdentityGrants,
  }),
  Object.freeze({
    file: PATIENT_CREATE_GRANTS_MIGRATION,
    grants: patientCreateGrants,
  }),
  Object.freeze({
    file: PATIENT_READS_GRANTS_MIGRATION,
    grants: patientReadsGrants,
  }),
  Object.freeze({
    file: PATIENT_DEMOGRAPHICS_WRITE_GRANTS_MIGRATION,
    grants: patientDemographicsWriteGrants,
  }),
  Object.freeze({ file: PATIENT_CHILDREN_WRITE_GRANTS_MIGRATION, grants: patientChildrenWriteGrants }),
  Object.freeze({ file: PATIENT_LIFECYCLE_GRANTS_MIGRATION, grants: patientLifecycleGrants }),
  Object.freeze({ file: PROVIDER_MUTATIONS_GRANTS_MIGRATION, grants: providerMutationGrants }),
  Object.freeze({ file: PROVIDER_READS_GRANTS_MIGRATION, grants: providerReadGrants }),
  Object.freeze({ file: PROCEDURE_RPCS_GRANTS_MIGRATION, grants: procedureRpcGrants }),
  Object.freeze({
    file: "20260826010503_procedure_input_hardening_grants.sql",
    grants: Object.freeze([
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.create_procedure(uuid, jsonb)",
        privilege: "execute",
        columns: [],
        reason: "Restores the exact 20260826010501 terminal EXECUTE grant that the 20260826010502 numeric-input hardening migration cancelled when it recreated the function definition; authorization remains entirely inside the SECURITY DEFINER body.",
      },
    ]),
  }),
  Object.freeze({
    file: PATIENT_FILE_UPLOAD_RPCS_GRANTS_MIGRATION,
    grants: patientFileUploadRpcGrants,
  }),
  Object.freeze({
    file: PATIENT_FILE_READ_RPCS_GRANTS_MIGRATION,
    grants: patientFileReadRpcGrants,
  }),
  Object.freeze({
    file: PATIENT_FILE_ARCHIVE_RPC_GRANTS_MIGRATION,
    grants: patientFileArchiveRpcGrants,
  }),
  Object.freeze({
    file: PATIENT_FILE_METADATA_OBJECT_KEY_GRANTS_MIGRATION,
    grants: Object.freeze([
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.get_file_metadata(uuid,uuid)",
        privilege: "execute",
        columns: [],
        reason:
          "Restores the exact 20260826010801 terminal EXECUTE grant that the P4-07 projection-extension migration cancelled when it recreated the function definition. The bounded single-file gate now also returns the opaque object_key so the server-only file service can verify stored objects and mint presigned URLs strictly after this authorization check; checksums stay unexposed and base-table privileges remain denied.",
      },
    ]),
  }),
  Object.freeze({
    file: PATIENT_FILE_CONFIRM_VERIFIED_SIZE_GRANTS_MIGRATION,
    grants: Object.freeze([
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.confirm_file_upload(uuid,uuid,integer,bigint)",
        privilege: "execute",
        columns: [],
        reason:
          "Restores the exact 20260826010701 terminal EXECUTE grant pattern that the P4-07 verified-size migration cancelled when it replaced the confirm_file_upload definition with a fourth required bigint parameter. The server-side storage adapter measures the stored object with a HEAD request and passes that server-verified size, which the SECURITY DEFINER body persists into size_bytes when the row becomes available, and a database CHECK now guarantees every available file row carries a non-null verified size.",
      },
    ]),
  }),
  Object.freeze({
    file: PATIENT_ATTRIBUTION_RPCS_GRANTS_MIGRATION,
    grants: Object.freeze([
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.create_patient(uuid,text,text,text,text,text,date,text,text,text,text,text,text,uuid,text,text,boolean,jsonb)",
        privilege: "execute",
        columns: [],
        reason: "Additive patient-creation overload preserving the historical signature while accepting only a server-validated attribution document; tenant, actor, audit, and version values remain derived internally.",
      },
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.update_patient_attribution(uuid,uuid,integer,jsonb)",
        privilege: "execute",
        columns: [],
        reason: "The sole attribution mutation boundary derives the active branch tenant and actor, requires live demographics-write permission, locks the tenant-scoped patient version, validates active catalogs and same-tenant referrers, and appends one opaque audit event atomically.",
      },
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.get_patient_detail(uuid,uuid)",
        privilege: "execute",
        columns: [],
        reason: "Restores the exact existing patient-detail grant after P5-03 recreates its bounded projection to include attribution catalog labels and referrer snapshot data under the existing demographics-read authorization boundary.",
      },
    ]),
  }),
  Object.freeze({
    file: PATIENT_REFERRAL_RPCS_GRANTS_MIGRATION,
    grants: Object.freeze([
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.create_patient_referral(uuid,uuid,jsonb)",
        privilege: "execute",
        columns: [],
        reason: "The sole referral creation boundary derives the tenant and actor from an active acting branch, requires live demographics-write, accepts only a bounded allowlisted referral document, and appends one opaque patient-linked audit event atomically.",
      },
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.update_patient_referral_status(uuid,uuid,integer,text)",
        privilege: "execute",
        columns: [],
        reason: "The sole referral lifecycle boundary derives the active branch tenant and actor, requires live demographics-write, locks the tenant-scoped optimistic version, permits only reviewed forward transitions, and appends one opaque patient-linked audit event atomically.",
      },
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.list_patient_referrals(uuid,uuid,boolean)",
        privilege: "execute",
        columns: [],
        reason: "The bounded referral read boundary derives the tenant from an active acting branch, requires live demographics-read, returns only a deterministic 200-row administrative projection, and writes no audit event.",
      },
    ]),
  }),
  Object.freeze({
    file: ACQUISITION_CATALOG_READS_GRANTS_MIGRATION,
    grants: Object.freeze([
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.list_acquisition_sources(uuid)",
        privilege: "execute",
        columns: [],
        reason: "The bounded acquisition-source catalog read derives the organization from an active authenticated acting branch, requires live patient.demographics.read, exposes only active global-or-same-tenant source DTOs, and leaves the zero base-table grant boundary intact.",
      },
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.list_booking_channels(uuid)",
        privilege: "execute",
        columns: [],
        reason: "The bounded booking-channel catalog read derives authorization from an active authenticated acting branch, requires live patient.demographics.read, returns only active global channel DTOs, and leaves the zero base-table grant boundary intact.",
      },
    ]),
  }),
  Object.freeze({
    file: ACQUISITION_REPORT_GRANTS_MIGRATION,
    grants: Object.freeze([
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.get_acquisition_summary(uuid,integer)",
        privilege: "execute",
        columns: [],
        reason:
          "The sole browser-reachable analytics report read. It derives the organization from an active authenticated acting branch, requires live organization-wide analytics.view (OWNER/ADMIN only), validates the bounded window, and returns only aggregated patient counts by source/category/channel for the actor's organization while writing no audit event.",
      },
    ]),
  }),
  Object.freeze({
    file: APPOINTMENT_RPCS_GRANTS_MIGRATION,
    grants: appointmentRpcGrants,
  }),
]);

/**
 * Fails closed when a supersede marker references something that does not
 * actually exist. `supersededFrom` names the migration whose application
 * revokes the grant — the pivot of the boundary-aware replay expectation — so
 * it must be the exact name of a .sql file in MIGRATIONS_DIRECTORY; the
 * revoking migration is usually an ordinary object migration, not itself a
 * registered grant-terminal. A dangling value there would silently misplace
 * the exclusion window. `supersededBy`, when present, must name an object some
 * registered grant carries. A supersede marker without `supersededFrom` is
 * refused outright: replay could not know when the privilege stops being
 * expected.
 *
 * Runs once at module load so every consumer of this registry — the static
 * lint, the unit tests, and R6-D replay — refuses a broken one immediately.
 */
export function assertSupersedeReferencesResolve(terminalMigrations = TERMINAL_MIGRATIONS) {
  const migrationsDirectory = join(repositoryRoot, ...MIGRATIONS_DIRECTORY.split("/"));
  const migrationFiles = new Set(
    existsSync(migrationsDirectory)
      ? readdirSync(migrationsDirectory).filter((name) => name.toLowerCase().endsWith(".sql"))
      : [],
  );
  const registeredObjects = new Set(
    terminalMigrations.flatMap((terminal) =>
      terminal.grants.map((grant) => grant.object.replaceAll(" ", "")),
    ),
  );

  for (const terminal of terminalMigrations) {
    for (const grant of terminal.grants) {
      if (!grant.supersededBy && !grant.supersededFrom) {
        continue;
      }

      if (!grant.supersededFrom) {
        throw new Error(
          `The approved grant "${grant.object}" records supersededBy without supersededFrom. ` +
            "Boundary replay cannot tell which migration revokes it; name the migration file " +
            "in " + MIGRATIONS_DIRECTORY + " that revokes this grant.",
        );
      }

      if (!migrationFiles.has(grant.supersededFrom)) {
        throw new Error(
          `The approved grant "${grant.object}" names supersededFrom ` +
            `"${grant.supersededFrom}", which is not a .sql file in ${MIGRATIONS_DIRECTORY}.`,
        );
      }

      if (grant.supersededBy && !registeredObjects.has(grant.supersededBy.replaceAll(" ", ""))) {
        throw new Error(
          `The approved grant "${grant.object}" names supersededBy ` +
            `"${grant.supersededBy}", which no registered terminal migration grants.`,
        );
      }
    }
  }
}

assertSupersedeReferencesResolve();

/**
 * Extensions the canonical baseline is permitted to create.
 *
 * Deliberately EMPTY (R6-C1, ADR-018). Extension functions are created with
 * PUBLIC EXECUTE by default and cannot be revoked object-by-object by a static
 * checker, so every extension is an exception to the fail-closed creation rule
 * and needs an explicit, separately reasoned approval entry here.
 *
 * pgTAP was removed from the baseline and moved to
 * `supabase/provisioning/nonproduction/001_database_test_tooling.sql`, which is
 * applied only to DEV and disposable Cloud TEST projects. Reconstructing the
 * application schema — including in a future production project — must not
 * require installing testing infrastructure.
 *
 * An empty list means any `CREATE EXTENSION` in `supabase/migrations/` is a
 * violation. That is the intended review gate: adding one requires an entry
 * here stating why the extension belongs in every environment.
 */
export const APPROVED_EXTENSIONS = Object.freeze([
  {
    name: "btree_gist",
    reason:
      "Provides the uuid `=` operator class required by the reservation-ledger partial GiST exclusion constraints (P6-05) that reject provider/resource double booking at the database level.",
  },
]);
