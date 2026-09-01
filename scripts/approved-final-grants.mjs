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

const OPERATIONAL_ANALYTICS_GRANTS_MIGRATION =
  "20260827014501_operational_analytics_grants.sql";

const operationalAnalyticsGrants = Object.freeze([
  "public.get_operational_analytics_summary(uuid,uuid,integer)",
  "public.list_operational_analytics_breakdown(uuid,uuid,integer)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  reason: "The aggregate-only operational analytics boundary derives the tenant from an active authenticated acting branch, requires live organization-wide analytics.view (OWNER/ADMIN only), validates an optional same-organization branch and a 30/90/365-day window, and returns only summary counts/rates or bounded dimension counts/booked minutes. It exposes no patient rows or clinical/contact content, keeps acquisition source separate from initial booking channel, and writes no audit event.",
})));

const APPOINTMENT_RPCS_GRANTS_MIGRATION =
  "20260827010501_appointment_rpcs_grants.sql";

const appointmentRpcGrants = Object.freeze([
  "public.create_appointment(uuid,uuid,jsonb)",
  "public.reschedule_appointment(uuid,uuid,integer,timestamptz,timestamptz)",
  "public.cancel_appointment(uuid,uuid,integer,text)",
  "public.update_appointment_status(uuid,uuid,integer,text,text,text)",
  "public.list_appointments(uuid,timestamptz,timestamptz,uuid,text)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only appointment scheduling boundary. It derives the tenant and actor from an active authenticated acting branch, requires live appointment.write (create/reschedule/cancel/status) or appointment.read (list), validates providers against active branch assignments and recurring availability with no UNAVAILABLE/LEAVE exception, relies on the reservation-ledger exclusion constraints as the final race protection, and appends one atomic audit event per mutation." })));

const SCHEDULING_READS_GRANTS_MIGRATION =
  "20260827010601_scheduling_reads_grants.sql";

const schedulingReadsGrants = Object.freeze([
  "public.list_availability(uuid,uuid,date,date)",
  "public.find_available_slots(uuid,uuid,timestamptz,timestamptz,integer,integer)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "Bounded scheduling read surfaces. Both derive the organization from an active authenticated acting branch, require live appointment.read, validate the window/duration bounds, restrict results to the acting branch and organization, return only deterministic availability/slot projections, and write no audit event." })));

const QUEUE_RPCS_GRANTS_MIGRATION =
  "20260827010901_queue_rpcs_grants.sql";

const queueRpcGrants = Object.freeze([
  "public.create_walkin_entry(uuid,uuid,text,uuid,uuid)",
  "public.update_queue_status(uuid,uuid,integer,text,text)",
  "public.list_queue(uuid,boolean)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only walk-in/queue boundary. Walk-in creation inserts a queue entry, never a fake appointment, and queue transitions never touch appointment rows. Functions derive the tenant and actor from an active authenticated acting branch, require live queue.manage (mutations) or queue.read (list), validate forward-only status transitions under an optimistic version, and append one atomic audit event per mutation while the list writes none." })));

const COMMUNICATION_RPCS_GRANTS_MIGRATION =
  "20260827011201_communication_rpcs_grants.sql";

const communicationRpcGrants = Object.freeze([
  "public.enqueue_communication(uuid,uuid,text,text,text,text,text,timestamptz)",
  "public.cancel_communication(uuid,uuid,integer)",
  "public.list_communications(uuid,uuid,text)",
  "public.acknowledge_communication(uuid,uuid,text)",
  "public.fail_communication(uuid,uuid)",
  "public.claim_due_communications(uuid,integer)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only communication/reminder boundary. Functions derive the tenant and actor from an active authenticated acting branch and require live communication.send (enqueue/cancel/acknowledge/fail/claim) or communication.view (bounded masked list). Enqueues are durable INSERTs inside the appointment transaction so external sending never blocks the appointment save; cancellation/rescheduling cancels obsolete queued jobs; the worker claims due jobs with FOR UPDATE SKIP LOCKED and acknowledges or fails them; the list never returns a full recipient." })));

const REQUEUE_COMMUNICATION_GRANTS_MIGRATION =
  "20260827011301_communication_requeue_grants.sql";

const requeueCommunicationGrants = Object.freeze([
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.requeue_communication(uuid,uuid,integer)",
    privilege: "execute",
    columns: [],
    reason:
      "The only bounded manual retry surface. It derives the tenant and actor from an active authenticated acting branch, requires live communication.send, rejects non-FAILED rows and stale versions, and copies the failed job's own stored content into a fresh QUEUED row keyed requeue-<id>-<version> so the browser never supplies recipient or body.",
  },
]);

const CALENDAR_SYNC_RPCS_GRANTS_MIGRATION =
  "20260827011601_calendar_sync_rpcs_grants.sql";

const calendarSyncRpcGrants = Object.freeze([
  "public.enqueue_calendar_sync(uuid,uuid,uuid,text)",
  "public.list_calendar_syncs(uuid,uuid)",
  "public.claim_due_calendar_syncs(uuid,integer)",
  "public.acknowledge_calendar_sync(uuid,uuid,text)",
  "public.fail_calendar_sync(uuid,uuid,text)",
  "public.connect_calendar(uuid,uuid,text,text)",
  "public.disconnect_calendar(uuid,uuid)",
  "public.list_calendar_integrations(uuid)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only provider calendar sync and integration boundary. Functions derive the tenant and actor from an active authenticated acting branch and require live calendar.manage. Enqueues are durable, idempotent INSERTs inside the appointment transaction; the worker claims due jobs with FOR UPDATE SKIP LOCKED and acknowledges or fails them with an upserted event link; connect/disconnect are high-impact configuration mutations that append one opaque audit event each; the list projections are bounded and never expose the opaque google_account_ref or Google event details." })));

const SPECIALIST_REQUEST_RPCS_GRANTS_MIGRATION =
  "20260827011901_specialist_request_rpcs_grants.sql";

const specialistRequestRpcGrants = Object.freeze([
  "public.create_specialist_request(uuid,uuid,jsonb)",
  "public.respond_specialist_request(uuid,uuid,integer,jsonb)",
  "public.cancel_specialist_request(uuid,uuid,integer,text)",
  "public.list_specialist_requests(uuid,text)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only visiting/on-call specialist request boundary. Functions derive the tenant and actor from an active authenticated acting branch and require live specialist.request. Requests carry only a minimal bounded non-clinical case summary; responses are SENT-only forward transitions by the requested provider linked user or an org role.manage holder; acceptance assigns the SPECIALIST provider and enqueues the existing calendar-sync CREATE and communication automation inside the same transaction; the list is a bounded 200-row projection exposing only the case summary." })));

const CLINICAL_RPCS_GRANTS_MIGRATION =
  "20260827013001_clinical_rpcs_grants.sql";
const CLINICAL_ENCOUNTER_ACTOR_PROVIDER_GRANTS_MIGRATION =
  "20260901010001_clinical_encounter_actor_provider_grants.sql";
const UNIFIED_CLINICAL_VISIT_LIFECYCLE_GRANTS_MIGRATION =
  "20260901010101_unified_clinical_visit_lifecycle_grants.sql";
// The object migration that CREATE OR REPLACEs the lifecycle function and, being
// adjacent to that creation, REVOKEs the authenticated grant. This is the file
// that revokes, so it is the supersede pivot below — not the grants file that
// re-grants one boundary later.
const UNIFIED_CLINICAL_VISIT_LIFECYCLE_LOCK_SEED_MIGRATION =
  "20260901010110_unified_clinical_visit_lifecycle_lock_seed.sql";
const UNIFIED_CLINICAL_VISIT_LIFECYCLE_LOCK_SEED_GRANTS_MIGRATION =
  "20260901010111_unified_clinical_visit_lifecycle_lock_seed_grants.sql";
const CLINICAL_PHOTO_RPCS_GRANTS_MIGRATION =
  "20260830010601_clinical_photo_rpcs_grants.sql";
const CLINICAL_PHOTO_PROCESSING_LIFECYCLE_GRANTS_MIGRATION =
  "20260830010613_clinical_photo_processing_lifecycle_grants.sql";
const CLINICAL_PHOTO_BROWSER_COMPLETION_REVOKE_MIGRATION =
  "20260830010618_clinical_photo_browser_completion_revoke.sql";
const CLINICAL_PHOTO_SERVER_COMPLETION_GRANTS_MIGRATION =
  "20260830010620_clinical_photo_server_completion_grants.sql";
const CLINICAL_PHOTO_ACTION_RPCS_GRANTS_MIGRATION =
  "20260830010622_clinical_photo_action_rpcs_grants.sql";

const ODONTOGRAM_RPCS_GRANTS_MIGRATION =
  "20260827013201_odontogram_rpcs_grants.sql";

const odontogramRpcGrants = Object.freeze([
  "public.create_tooth_condition(uuid,uuid,text,text,text,text,text)",
  "public.void_tooth_condition(uuid,uuid,integer,text)",
  "public.list_tooth_conditions(uuid,uuid,boolean)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  supersededFrom: "20260828020500_odontogram_legacy_retire.sql",
  reason:
    "Historical P15-02 odontogram boundary. Retired in O13 by 20260828020500 which revokes all three signatures after the backfill to tooth_clinical_entries and the read cutover to get_patient_odontogram. Replay boundaries through 20260828020401 legitimately hold this privilege and must expect it; from the revoking boundary onward it no longer exists in the live catalog and is excluded from the approved final set.",
})));

const ODONTOGRAM_O5_RPCS_GRANTS_MIGRATION = "20260828020401_odontogram_rpcs_grants.sql";
const ODONTOGRAM_RESOLUTION_RPC_GRANT_MIGRATION =
  "20260828020517_odontogram_resolution_rpc_grant.sql";
const ODONTOGRAM_CLINICAL_EVENT_LINEAGE_GRANT_MIGRATION =
  "20260828020521_clinical_entry_event_lineage_grants.sql";
const ODONTOGRAM_CLINICAL_RPC_QUALIFICATION_GRANT_MIGRATION =
  "20260828020523_clinical_entry_rpc_qualification_grants.sql";
const ODONTOGRAM_CLINICAL_AUDIT_METADATA_GRANT_MIGRATION =
  "20260828020525_clinical_entry_audit_metadata_grant.sql";
const ODONTOGRAM_O5_O8_TERMINAL_GRANTS_MIGRATION =
  "20260828020537_odontogram_o5_o8_terminal_grants.sql";
const ODONTOGRAM_O5_O8_FINAL_RECONCILIATION_GRANTS_MIGRATION =
  "20260828020539_odontogram_o5_o8_final_reconciliation_grants.sql";
const ODONTOGRAM_O5_O8_SERIALIZED_FINAL_GRANTS_MIGRATION =
  "20260828020541_odontogram_o5_o8_serialized_final_grants.sql";
const ODONTOGRAM_FEATURE_DETAILS_RPC_GRANTS_MIGRATION =
  "20260830010003_odontogram_feature_details_rpc_grants.sql";
const PROCEDURE_CASE_PLAN_DETAIL_GRANTS_MIGRATION =
  "20260830010102_procedure_case_plan_detail_grants.sql";
const PROCEDURE_CASE_PLAN_DETAIL_RPC_GRANTS_MIGRATION =
  "20260830010107_procedure_case_plan_detail_rpcs_grants.sql";
const TREATMENT_PLAN_DETAIL_PRESENCE_RPC_GRANTS_MIGRATION = "20260830010109_treatment_plan_detail_presence_rpcs_grants.sql";
const ODONTOGRAM_REVAMP_RPCS_GRANTS_MIGRATION = "20260830010301_odontogram_revamp_rpcs_grants.sql";
const ODONTOGRAM_REVAMP_TERMINAL_REPAIR_GRANTS_MIGRATION = "20260830010303_odontogram_revamp_terminal_repair_grants.sql";
const ODONTOGRAM_REVAMP_IMPLANT_CHARGE_GRANTS_MIGRATION = "20260830010305_odontogram_revamp_implant_charge_grants.sql";
const ODONTOGRAM_REVAMP_DIRECT_CHARGE_AND_BRIDGE_GRANTS_MIGRATION = "20260830010307_odontogram_direct_charge_and_bridge_grants.sql";
const PROCEDURE_INSTALLMENT_SCHEDULE_GRANTS_MIGRATION = "20260830010401_procedure_installment_schedules_grants.sql";
const PROCEDURE_INSTALLMENT_SCHEDULE_LIFECYCLE_GRANTS_MIGRATION = "20260830010403_procedure_installment_schedule_lifecycle_grants.sql";
const PROCEDURE_INSTALLMENT_SCHEDULE_AMENDMENT_GRANTS_MIGRATION = "20260830010405_procedure_installment_schedule_amendments_grants.sql";
const PROCEDURE_INSTALLMENT_SCHEDULE_IDEMPOTENCY_REPAIR_GRANTS_MIGRATION = "20260830010407_installment_schedule_idempotency_repair_grants.sql";
const PROCEDURE_INSTALLMENT_SCHEDULE_IDEMPOTENCY_CONCURRENCY_GRANTS_MIGRATION = "20260830010409_installment_schedule_idempotency_concurrency_grants.sql";
const PROCEDURE_INSTALLMENT_SCHEDULE_LIFECYCLE_ORDERING_GRANTS_MIGRATION = "20260830010411_installment_schedule_lifecycle_ordering_grants.sql";
const ODONTOGRAM_DTO_FEATURE_DETAIL_GRANTS_MIGRATION = "20260830010417_odontogram_dto_feature_detail_projection_grants.sql";
const ATOMIC_CASE_COMPLETION_GRANTS_MIGRATION = "20260830010419_atomic_case_completion_grants.sql";
const TREATMENT_PLAN_COMPLETION_CONTEXT_GRANTS_MIGRATION = "20260830010424_treatment_plan_completion_context_grants.sql";

const odontogramRevampRpcGrants = Object.freeze([
  "public.get_patient_odontogram_v3(uuid,uuid)",
  "public.record_tooth_clinical_entry_v3(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text)",
  "public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,text)",
  "public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,text)",
  "public.record_direct_treatment_with_charge(uuid,uuid,uuid,bigint,jsonb,text)",
  "public.record_procedure_followup(uuid,uuid,text,timestamptz,text)",
].map((object) => ({
  grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [],
  reason: "O5 revamp browser boundary: SECURITY DEFINER derives tenant, signed-in active provider, and branch authorization; writes are bounded, audited, idempotent, and expose no base-table grant.",
})));

const odontogramO5O8TerminalGrants = Object.freeze([
  "public.get_patient_odontogram(uuid,uuid)",
  "public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,text)",
  "public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text)",
  "public.void_tooth_clinical_entry(uuid,uuid,integer,text)",
  "public.resolve_legacy_odontogram_entry(uuid,uuid,text,uuid,uuid,uuid,text)",
  "public.create_plan_bridge_design(uuid,uuid,uuid,jsonb)",
  "public.update_draft_plan_bridge_design(uuid,uuid,integer,jsonb)",
  "public.record_current_bridge(uuid,uuid,jsonb,uuid,timestamptz,uuid)",
  "public.amend_current_bridge(uuid,uuid,integer,jsonb)",
  "public.void_current_bridge(uuid,uuid,integer,text)",
  "public.create_plan_implant_design(uuid,uuid,uuid,jsonb)",
  "public.update_draft_plan_implant_design(uuid,uuid,integer,jsonb)",
  "public.record_current_implant_component(uuid,uuid,jsonb,uuid,timestamptz,uuid)",
  "public.amend_current_implant_component(uuid,uuid,integer,jsonb)",
  "public.void_current_implant_component(uuid,uuid,integer,text)",
  "public.create_periodontal_examination(uuid,uuid,uuid,text)",
  "public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)",
  "public.finalize_periodontal_examination(uuid,uuid,integer)",
  "public.amend_periodontal_examination(uuid,uuid,uuid)",
  "public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)",
  "public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text)",
  "public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  ...(object === "public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,text)" ? {
    supersededFrom: "20260830010002_odontogram_feature_details_rpc.sql",
    supersededBy: "public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text)",
  } : ["public.record_current_bridge(uuid,uuid,jsonb,uuid,timestamptz,uuid)", "public.record_current_implant_component(uuid,uuid,jsonb,uuid,timestamptz,uuid)"].includes(object) ? { supersededFrom: "20260830010303_odontogram_revamp_terminal_repair_grants.sql" } : {}),
  reason:
    "Final O5/O8 browser boundary after explicit forward replacement. Each SECURITY DEFINER function derives tenant and patient from trusted rows, checks live branch permission, preserves append-only history, bounds returned aggregates, and keeps all tenant tables RLS-locked with zero browser table grants.",
})));

const odontogramO5O8FinalReconciliationGrants = Object.freeze([
  ...odontogramO5O8TerminalGrants,
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.resolve_odontogram_entity_patient(uuid,text,uuid)",
    privilege: "execute",
    columns: [],
    reason:
      "Allows mutation services to resolve the authoritative patient from a tenant-scoped canonical entity after live clinical-write authorization, so cache invalidation never trusts a client-supplied patient identifier.",
  },
]);

const odontogramO5Grants = Object.freeze([
  "public.get_patient_odontogram(uuid,uuid)",
  "public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,text)",
  "public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text)",
  "public.void_tooth_clinical_entry(uuid,uuid,integer,text)",
  "public.resolve_legacy_odontogram_entry(uuid,uuid,text,uuid,text)",
  "public.create_plan_bridge_design(uuid,uuid,uuid,jsonb)",
  "public.update_draft_plan_bridge_design(uuid,uuid,integer,jsonb)",
  "public.record_current_bridge(uuid,uuid,jsonb,uuid,timestamptz,uuid)",
  "public.amend_current_bridge(uuid,uuid,integer,jsonb)",
  "public.void_current_bridge(uuid,uuid,integer,text)",
  "public.create_plan_implant_design(uuid,uuid,uuid,jsonb)",
  "public.update_draft_plan_implant_design(uuid,uuid,integer,jsonb)",
  "public.record_current_implant_component(uuid,uuid,jsonb,uuid,timestamptz,uuid)",
  "public.amend_current_implant_component(uuid,uuid,integer,jsonb)",
  "public.void_current_implant_component(uuid,uuid,integer,text)",
  "public.create_periodontal_examination(uuid,uuid,uuid,text)",
  "public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)",
  "public.finalize_periodontal_examination(uuid,uuid,integer)",
  "public.amend_periodontal_examination(uuid,uuid,uuid)",
  "public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text)",
  "public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,uuid,bigint,date)",
  "public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  ...(object === "public.resolve_legacy_odontogram_entry(uuid,uuid,text,uuid,text)"
    ? {
        supersededBy:
          "public.resolve_legacy_odontogram_entry(uuid,uuid,text,uuid,uuid,uuid,text)",
        supersededFrom:
          "20260828020516_odontogram_resolution_and_lineage_serialization.sql",
      }
    : object === "public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,text)"
      ? {
          supersededFrom: "20260830010002_odontogram_feature_details_rpc.sql",
          supersededBy: "public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text)",
        }
      : {}),
  reason:
    "O5 odontogram clinical boundary (ADR-028). Derives organization_id from an active acting branch (status='active'), binds actor via auth.uid(), gates on patient.clinical permissions (read/write plus elevated patient.clinical.correct for legacy resolution, bridge/implant/perio correction and nonterminal execution correction), validates patient membership via FOR KEY SHARE, uses optimistic versions, caps projections at 200 rows / bounded batches, and emits one atomic CLINICAL audit event per mutation. Base tables remain RLS-locked with zero policies.",
})));

const odontogramResolutionRpcGrant = Object.freeze([
  "public.resolve_legacy_odontogram_entry(uuid,uuid,text,uuid,uuid,uuid,text)",
  "public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text)",
  "public.void_tooth_clinical_entry(uuid,uuid,integer,text)",
  "public.record_current_bridge(uuid,uuid,jsonb,uuid,timestamptz,uuid)",
  "public.amend_current_bridge(uuid,uuid,integer,jsonb)",
  "public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  reason:
    "Restores the reviewed O2-O4 mutation boundary after the forward fail-closed repair revoked the replacement definitions from every browser role. Authorization remains inside the SECURITY DEFINER body; the legacy reconciliation signature additionally accepts exactly one same-patient clinical-entry, bridge, or treatment-plan-item target only for an ambiguous legacy row.",
})));

const odontogramClinicalEventLineageGrants = Object.freeze([
  "public.get_patient_odontogram(uuid,uuid)",
  "public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text)",
  "public.void_tooth_clinical_entry(uuid,uuid,integer,text)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  reason:
    "Restores the reviewed clinical-entry read/amend/void boundary after successor-side lineage and append-only void events replaced predecessor mutation. Tenant and patient authorization remain inside the SECURITY DEFINER functions, and the bounded read derives terminal lifecycle from immutable successor/event rows.",
})));

const odontogramClinicalRpcQualificationGrants = Object.freeze([
  "public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text)",
  "public.void_tooth_clinical_entry(uuid,uuid,integer,text)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  reason:
    "Restores the unchanged reviewed amend/void privilege boundary after the forward local qualification repair removed PL/pgSQL output-column ambiguity; authorization and event-only lineage semantics remain inside the SECURITY DEFINER bodies.",
})));

const odontogramClinicalAuditMetadataGrant = Object.freeze([
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text)",
    privilege: "execute",
    columns: [],
    reason:
      "Restores the unchanged reviewed amend boundary after the forward audit-metadata repair removed a disallowed predecessor identifier; successor lineage remains structural and authorization remains inside the SECURITY DEFINER body.",
  },
]);

// ---------------------------------------------------------------------------
// Treatment-plan — preserved for O8 execution linkage
// ---------------------------------------------------------------------------

const TREATMENT_PLAN_RPCS_GRANTS_MIGRATION =
  "20260827013401_treatment_plan_rpcs_grants.sql";

const treatmentPlanRpcGrants = Object.freeze([
  "public.create_treatment_plan(uuid,uuid,text)",
  "public.update_treatment_plan(uuid,uuid,integer,text)",
  "public.present_treatment_plan(uuid,uuid,integer)",
  "public.acknowledge_treatment_plan(uuid,uuid,integer)",
  "public.add_treatment_plan_item(uuid,uuid,integer,uuid,text,text,numeric)",
  "public.update_treatment_plan_item(uuid,uuid,uuid,integer,uuid,text,text,numeric)",
  "public.remove_treatment_plan_item(uuid,uuid,uuid,integer)",
  "public.add_treatment_plan_alternative(uuid,uuid,integer,text)",
  "public.add_treatment_plan_discussion(uuid,uuid,uuid,text,text)",
  "public.save_treatment_plan_drawing(uuid,uuid,integer,jsonb)",
  "public.list_treatment_plans(uuid,uuid)",
  "public.get_treatment_plan_detail(uuid,uuid)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only treatment-plan clinical boundary. Functions derive the tenant and actor from an active authenticated acting branch and require live patient.clinical.write (mutations) or patient.clinical.read (bounded projections). Plans are versioned with an immutable PRESENTED/ACKNOWLEDGED state backed by a database trigger; discussions are append-only on any status and always capture provider, time, and context. Every mutation appends one atomic opaque audit event while the read projections write none." })));

const TREATMENT_ESTIMATE_CENTAVO_REPAIR_MIGRATION =
  "20260828020505_treatment_estimate_centavo_contract_repair.sql";

const treatmentEstimateCentavoRepairGrants = Object.freeze([
  "public.add_treatment_plan_item(uuid,uuid,integer,uuid,text,text,numeric)",
  "public.update_treatment_plan_item(uuid,uuid,uuid,integer,uuid,text,text,numeric)",
  "public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint)",
  "public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint)",
  "public.get_treatment_plan_detail(uuid,uuid)",
  "public.generate_document(uuid,uuid,text,jsonb)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  reason:
    "Restores the reviewed treatment-plan write/read/document privilege after the B11 centavo contract repair recreated its definition. The compatibility numeric writers reject non-centavo peso inputs before exact conversion; current application writers accept bounded bigint centavos directly. Every writer still derives tenant and actor from the authenticated active-branch context, requires clinical.write, locks the same-tenant DRAFT plan, and appends one atomic opaque audit event; detail/document projections retain their existing clinical.read or document.generate boundary and expose only base-10 centavo strings.",
})));

const TREATMENT_ESTIMATE_PROJECTION_CONTRACT_MIGRATION =
  "20260828020507_treatment_estimate_projection_contract.sql";

const treatmentEstimateProjectionContractGrants = Object.freeze([
  "public.get_treatment_plan_detail(uuid,uuid)",
  "public.generate_document(uuid,uuid,text,jsonb)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  reason:
    "Restores the exact reviewed EXECUTE boundary after replacing the temporary catalog-source projection rewrite with explicit SECURITY DEFINER definitions. Treatment-plan detail still requires same-tenant clinical.read; document generation still requires same-tenant document.generate and writes one atomic opaque audit. Both projections expose advisory estimates only as bounded base-10 centavo strings, retain empty search paths, and grant no base-table access.",
})));

const TREATMENT_ESTIMATE_PROJECTION_BOUNDS_MIGRATION =
  "20260828020512_treatment_estimate_projection_bounds.sql";

const treatmentEstimateProjectionBoundsGrants = Object.freeze([
  "public.get_treatment_plan_detail(uuid,uuid)",
  "public.generate_document(uuid,uuid,text,jsonb)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  reason:
    "Restores the exact authenticated-only EXECUTE boundary after moving each deterministic projection cap into an ordered derived table before JSON aggregation. Treatment-plan detail still requires same-tenant clinical.read; document generation still requires same-tenant document.generate and appends one atomic opaque audit event. Both SECURITY DEFINER functions retain empty search paths and expose no base-table privilege.",
})));

const clinicalRpcGrants = Object.freeze([
  "public.create_clinical_encounter(uuid,uuid,uuid,uuid)",
  "public.create_clinical_note(uuid,uuid,text,text)",
  "public.update_clinical_note(uuid,uuid,integer,text)",
  "public.finalize_clinical_note(uuid,uuid,integer)",
  "public.amend_clinical_note(uuid,uuid,integer,text)",
  "public.finalize_clinical_encounter(uuid,uuid,integer)",
  "public.create_patient_medical_record(uuid,uuid,text,jsonb)",
  "public.void_patient_medical_record(uuid,uuid,integer)",
  "public.list_clinical_encounters(uuid,uuid)",
  "public.get_clinical_encounter_detail(uuid,uuid)",
  "public.list_patient_medical_records(uuid,uuid,text)",
  "public.create_prescription(uuid,uuid,jsonb)",
  "public.finalize_prescription(uuid,uuid,integer)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  ...(object === "public.create_clinical_encounter(uuid,uuid,uuid,uuid)"
    ? {
        supersededFrom: CLINICAL_ENCOUNTER_ACTOR_PROVIDER_GRANTS_MIGRATION,
        supersededBy: "public.create_clinical_encounter_v2(uuid,uuid,uuid)",
      }
    : {}),
  reason: "The only clinical data boundary. Functions derive the tenant and actor from an active authenticated acting branch and require live patient.clinical.write (mutations) or patient.clinical.read (bounded projections). Encounter/note/prescription rows carry an immutable FINALIZED state guarded by database triggers; finalized notes and prescriptions are only ever amended or recreated, never silently overwritten. Every mutation appends one atomic bounded-metadata audit event while the read projections write none.",
})));

const clinicalEncounterActorProviderGrants = Object.freeze([
  "public.create_clinical_encounter_v2(uuid,uuid,uuid)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  supersededFrom: UNIFIED_CLINICAL_VISIT_LIFECYCLE_GRANTS_MIGRATION,
  supersededBy: "public.start_or_resume_clinical_visit(uuid,uuid,uuid,uuid)",
  reason: "The encounter creation boundary derives the treating provider from the authenticated user's active same-tenant provider profile at the acting branch. The provider ID is never accepted from the browser, while tenant, branch, clinical.write, appointment, audit, and clinical record invariants remain enforced in the SECURITY DEFINER body. Superseded by the managed visit lifecycle, which additionally owns visit identity, the server-derived clinical date, and idempotent resume.",
})));

const CLINICAL_VISIT_LIFECYCLE_GRANT_REASON =
  "The only browser-callable clinical encounter creation boundary. It derives organization, actor, treating provider, and the Philippine clinical date inside a SECURITY DEFINER body with an empty search path, requires live patient.clinical.write at an active acting branch plus an active linked provider there, validates the patient and any appointment against the derived tenant, and converges repeated or concurrent calls on one managed OPEN visit under a transaction-scoped identity lock and a partial unique index. Only the create path appends one bounded audit event; a finalized visit is never reopened and pre-workspace encounters are never resumed or rewritten.";

const unifiedClinicalVisitLifecycleGrants = Object.freeze([
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.start_or_resume_clinical_visit(uuid,uuid,uuid,uuid)",
    privilege: "execute",
    columns: [],
    // The lock-seed replacement revokes adjacent to CREATE OR REPLACE, so this
    // registered grant stops existing when THAT object migration applies, and the
    // terminal below re-grants it one boundary later. The pivot must name the
    // revoking file: naming the re-granting file instead would leave this grant
    // expected at the boundary after the revoke, where the catalog no longer holds
    // it, and boundary replay would fail there. The object signature and the final
    // boundary are unchanged.
    supersededFrom: UNIFIED_CLINICAL_VISIT_LIFECYCLE_LOCK_SEED_MIGRATION,
    reason: CLINICAL_VISIT_LIFECYCLE_GRANT_REASON,
  },
]);

const unifiedClinicalVisitLifecycleLockSeedGrants = Object.freeze([
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.start_or_resume_clinical_visit(uuid,uuid,uuid,uuid)",
    privilege: "execute",
    columns: [],
    reason: `${CLINICAL_VISIT_LIFECYCLE_GRANT_REASON} Re-granted unchanged after the request-key advisory lock was moved to its own key space (seed 1) so that lock ordering, and therefore deadlock freedom, is structural rather than incidental.`,
  },
]);

const clinicalPhotoRpcGrants = Object.freeze([
  "public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text)",
  "public.list_clinical_photos(uuid,uuid)",
  "public.rename_clinical_photo(uuid,uuid,integer,text)",
  "public.pair_clinical_photos(uuid,uuid,uuid)",
  "public.record_clinical_photo_derivatives(uuid,uuid,text,bigint,jsonb)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  ...(object === "public.record_clinical_photo_derivatives(uuid,uuid,text,bigint,jsonb)"
    ? {
        supersededFrom: CLINICAL_PHOTO_BROWSER_COMPLETION_REVOKE_MIGRATION,
        supersededBy:
          "public.complete_clinical_photo_derivatives(uuid,uuid,uuid,text,bigint,jsonb)",
      }
    : {}),
  reason: "The narrow private clinical-photo metadata/processing boundary. Each function derives the organization from an active acting branch, enforces patient.clinical.read/write inside a SECURITY DEFINER body with an empty search path, preserves opaque source objects, and writes only bounded patient-linked audit events; no photo table or service-role privilege is exposed.",
})));

const INVENTORY_RPCS_GRANTS_MIGRATION =
  "20260827014201_inventory_rpcs_grants.sql";
const INVENTORY_TRANSFER_READ_GRANTS_MIGRATION =
  "20260827014301_inventory_transfer_reads_grants.sql";

const inventoryRpcGrants = Object.freeze([
  "public.create_inventory_item(uuid,text,text,text,text,integer,boolean)",
  "public.update_inventory_item(uuid,uuid,integer,text,text,text,integer,boolean,boolean)",
  "public.list_inventory_items(uuid,boolean)",
  "public.receive_stock(uuid,uuid,integer,text,date)",
  "public.adjust_stock(uuid,uuid,integer,integer,text)",
  "public.issue_stock(uuid,uuid,integer,integer,text)",
  "public.create_inventory_transfer(uuid,uuid,uuid,uuid,integer,text)",
  "public.confirm_transfer_receipt(uuid,uuid,integer)",
  "public.cancel_inventory_transfer(uuid,uuid,integer,text)",
  "public.list_inventory_stock(uuid,uuid,boolean)",
  "public.list_inventory_movements(uuid,uuid)",
  "public.get_inventory_aggregate(uuid)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only inventory boundary. Functions derive the tenant and actor from an active authenticated acting branch and require live inventory.manage (catalog, receipts, adjustments, issues, transfers) or inventory.view (bounded per-branch stock, movement ledger, and org aggregate). Stock balance changes run under a per-org-branch-item advisory lock and only ever post the matching append-only movement row in the same transaction; transfers stay SENT until the destination confirms receipt, which is the only moment the destination balance changes. Every mutation appends one atomic bounded-metadata audit event while the read projections write none." })));

const inventoryTransferReadGrants = Object.freeze([
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.list_inventory_transfers(uuid,text)",
    privilege: "execute",
    columns: [],
    reason: "The bounded inventory.view transfer projection required by the branch operations UI. It derives the tenant from the authenticated acting branch and returns only transfers where that branch is the source or destination, so pending destination receipts are actionable without any base-table grant or unrelated-branch exposure.",
  },
]);

const RECALL_RPCS_GRANTS_MIGRATION =
  "20260827014001_recall_rpcs_grants.sql";

const recallRpcGrants = Object.freeze([
  "public.create_recall_rule(uuid,text,integer,text,uuid)",
  "public.update_recall_rule(uuid,uuid,integer,text,integer,text,boolean)",
  "public.list_recall_rules(uuid,boolean)",
  "public.create_recall(uuid,uuid,uuid,timestamptz)",
  "public.set_recall_opt_out(uuid,uuid,boolean)",
  "public.complete_recall(uuid,uuid,integer)",
  "public.cancel_recall(uuid,uuid,integer)",
  "public.link_recall_appointment(uuid,uuid,integer,uuid)",
  "public.enqueue_recall_reminder(uuid,uuid,integer)",
  "public.list_recalls(uuid,uuid,text)",
  "public.get_recall_retention_summary(uuid)",
  "public.mark_recall_opted_out(uuid,uuid,integer)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only recall boundary. Functions derive the tenant and actor from an active authenticated acting branch and require live recall.manage (rule configuration, scheduling, opt-out, reminders, transitions) or recall.read (overdue list and bounded retention summary). Reminder enqueues are durable Phase 8 REMINDER INSERTs inside the recall transaction that respect patient and individual opt-outs and NONE-channel rules; overdue is derived. Every mutation appends one atomic opaque audit event while the read projections write none." })));

const DOCUMENT_RPCS_GRANTS_MIGRATION =
  "20260827012201_document_rpcs_grants.sql";

const DOCUMENT_TREATMENT_PLAN_GRANTS_MIGRATION =
  "20260827013500_document_treatment_plan.sql";

const INTAKE_RPCS_GRANTS_MIGRATION =
  "20260827013701_intake_rpcs_grants.sql";

const INTAKE_CONSENT_TEMPLATES_RPC_GRANTS_MIGRATION =
  "20260827013801_intake_consent_templates_rpc_grants.sql";

const intakeConsentTemplatesRpcGrants = Object.freeze([
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.list_consent_templates(uuid)",
    privilege: "execute",
    columns: [],
    reason:
      "The intake.manage-gated bounded 100-row consent-template catalog read for the create-link dialog. It derives the organization from an active authenticated acting branch, requires live intake.manage, returns only active global (org null) or same-organization templates ordered by name, and never exposes the template body while writing no audit event.",
  },
]);

const intakeRpcGrants = Object.freeze([
  {
    grantee: "anon",
    objectClass: "function",
    object: "public.public_get_intake_form(text,text)",
    privilege: "execute",
    columns: [],
    reason:
      "Deliberate public surface 6 of 7 (P17-02): an unauthenticated patient opening a per-form intake link must read the bounded form. It is SECURITY DEFINER with an empty search_path, never reads auth.uid(), resolves the organization by slug, matches a link purely by its stored SHA-256 token hash, and returns only form id/type/template version/consent body/privacy notice/expiry/status for that one patient+form -- never patient identity, answers, or other forms. Wrong, expired, revoked, or foreign-organization tokens are indistinguishable NULLs.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.public_get_intake_form(text,text)",
    privilege: "execute",
    columns: [],
    reason:
      "The same bounded anonymous intake-form read is also callable by signed-in users; the SECURITY DEFINER body performs no authentication-dependent branching.",
  },
  {
    grantee: "anon",
    objectClass: "function",
    object: "public.public_submit_intake_form(text,text,jsonb,boolean)",
    privilege: "execute",
    columns: [],
    reason:
      "Deliberate public surface 7 of 7 (P17-02): an unauthenticated patient must submit answers for the one intake form their link token binds. It validates a bounded answers object and requires privacy_acknowledged for CONSENT forms, transitions PENDING to SUBMITTED with answers preserved verbatim and submitted_via LINK, expires the link, and is idempotent for duplicates; no audit event is written because the caller is anonymous.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.public_submit_intake_form(text,text,jsonb,boolean)",
    privilege: "execute",
    columns: [],
    reason:
      "The same bounded anonymous intake submission is also callable by signed-in users; the SECURITY DEFINER body performs no authentication-dependent branching.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.create_intake_form(uuid,uuid,text,uuid)",
    privilege: "execute",
    columns: [],
    reason:
      "The only intake form/link creation boundary. It requires live intake.manage (OWNER/ADMIN/RECEPTIONIST) at an active acting branch, validates a same-tenant patient and a global-or-same-organization active consent template for CONSENT forms, creates a PENDING form plus one ACTIVE 7-day link storing only the SHA-256 token hash, returns the token plaintext exactly once, and appends one intake.form.created audit event atomically.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.mark_intake_form_paper(uuid,uuid,integer,text)",
    privilege: "execute",
    columns: [],
    reason:
      "The paper-sign alternative and the only intake paper/print transition. It requires live intake.manage, moves a PENDING or SUBMITTED same-branch form to PRINTED under an optimistic version stamping signed_by/signed_at and submitted_via PAPER, revokes every ACTIVE link, and appends one intake.form.printed audit event with bounded {reason} metadata.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.list_intake_forms(uuid,uuid)",
    privilege: "execute",
    columns: [],
    reason:
      "The intake.manage-gated bounded 100-row status projection for a same-tenant patient at the acting branch. Returns only form id, type, template version, status, submission/signing provenance and timestamps; never the answers body, and writes no audit event.",
  },
]);

const documentRpcGrants = Object.freeze([
  "public.generate_document(uuid,uuid,text,jsonb)",
  "public.list_documents(uuid,uuid,text)",
  "public.get_document_snapshot(uuid,uuid)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only document generation and read boundary. Functions derive the tenant and actor from an active authenticated acting branch and require live document.generate (generate_document) or document.view (list/get snapshot). generate_document builds the immutable data snapshot server-side from only the authorized, allowlisted patient record sections and appends one audit event; list is a bounded 100-row projection without the snapshot body; get_document_snapshot returns the exact stored snapshot for reproducible re-render." })));

const BOOKING_PUBLIC_RPCS_GRANTS_MIGRATION =
  "20260827012601_booking_public_rpcs_grants.sql";

const bookingPublicRpcGrants = Object.freeze([
  {
    grantee: "anon",
    objectClass: "function",
    object: "public.public_get_available_slots(text,text,integer)",
    privilege: "execute",
    columns: [],
    reason:
      "Deliberate public surface 2 of 5 (P13-02): unauthenticated visitors must read deterministic slot starts. It is SECURITY DEFINER with an empty search_path, requires no auth at all, resolves the active organization by slug plus its first website-visible branch, and returns only bounded (starts_at, ends_at) times for website-visible instant-bookable procedures with zero patient, clinical, or internal data.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.public_get_available_slots(text,text,integer)",
    privilege: "execute",
    columns: [],
    reason:
      "The same bounded anonymous slot-read is also callable by signed-in users; the SECURITY DEFINER body performs no authentication-dependent branching.",
  },
  {
    grantee: "anon",
    objectClass: "function",
    object: "public.public_submit_booking_request(text,jsonb)",
    privilege: "execute",
    columns: [],
    reason:
      "Deliberate public surface 3 of 5 (P13-02): unauthenticated visitors must submit a minimal booking request. It accepts exactly the allowlisted keys with bounded values, validates every referenced tenant object server-side, stores only a SHA-256 management-token hash, acquires a 5-minute ACTIVE HOLD provider reservation for instant-bookable procedures under the exclusion backstop, and creates no clinical patient record or audit event.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.public_submit_booking_request(text,jsonb)",
    privilege: "execute",
    columns: [],
    reason:
      "The same bounded anonymous submission is also callable by signed-in users; the SECURITY DEFINER body performs no authentication-dependent branching.",
  },
  {
    grantee: "anon",
    objectClass: "function",
    object: "public.public_get_booking_status(uuid,text)",
    privilege: "execute",
    columns: [],
    reason:
      "Deliberate public surface 4 of 5 (P13-02): status lookup matched by the stored management-token hash, returning only request id, status, created_at, and a converted flag. An unknown request or wrong hash returns no row, so it leaks neither existence nor any patient or clinical data.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.public_get_booking_status(uuid,text)",
    privilege: "execute",
    columns: [],
    reason:
      "The same bounded anonymous status lookup is also callable by signed-in users; the SECURITY DEFINER body performs no authentication-dependent branching.",
  },
  {
    grantee: "anon",
    objectClass: "function",
    object: "public.public_cancel_booking_request(uuid,text)",
    privilege: "execute",
    columns: [],
    reason:
      "Deliberate public surface 5 of 5 (P13-02): anonymous cancellation matched by the stored management-token hash, moving a SUBMITTED/UNDER_REVIEW request to CANCELLED and releasing its ACTIVE HOLD provider reservation. A wrong or missing hash is denied indistinguishably from an unknown request and no audit event is written.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.public_cancel_booking_request(uuid,text)",
    privilege: "execute",
    columns: [],
    reason:
      "The same bounded anonymous cancellation is also callable by signed-in users; the SECURITY DEFINER body performs no authentication-dependent branching.",
  },
]);

const BOOKING_REVIEW_RPCS_GRANTS_MIGRATION =
  "20260827012701_booking_review_rpcs_grants.sql";

const bookingReviewRpcGrants = Object.freeze([
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "private.has_booking_review_permission_at_branch(uuid,text)",
    privilege: "execute",
    columns: [],
    reason:
      "The booking.review permission helper. It is granted to authenticated so a Data API session may evaluate it directly if ever needed, mirroring the private RLS-helper grant pattern; private schema USAGE remains revoked so it is not reachable as a public RPC, and the staff review RPCs call it inside their SECURITY DEFINER bodies.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.list_booking_requests(uuid,text)",
    privilege: "execute",
    columns: [],
    reason:
      "The booking.review-gated bounded 200-row review queue. It derives the organization from an active authenticated acting branch, requires live booking.review, filters to the acting organization and branch, and returns only the minimal submitted demographic fields and request labels -- never management_token_hash, referral_payload, or clinical data -- writing no audit event.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.review_booking_request(uuid,uuid,integer,text,text)",
    privilege: "execute",
    columns: [],
    reason:
      "The only booking review mutation. It requires live booking.review at the acting branch, locks the request row with an optimistic version, and on APPROVE converts the request to a real appointment in the same transaction (resolving or minimally creating the patient server-side with demographics-write only when needed, converting the ACTIVE HOLD reservation to an APPOINTMENT reservation, and letting the existing appointment automation triggers fire) while DECLINE/SPAM release the hold. Each action appends one booking.request.reviewed audit event with bounded action metadata.",
  },
]);

const SITE_RPCS_GRANTS_MIGRATION =
  "20260827012401_site_rpcs_grants.sql";

const siteRpcGrants = Object.freeze([
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.get_public_site(text)",
    privilege: "execute",
    columns: [],
    reason:
      "The single deliberate unauthenticated public site surface, also callable by signed-in users. It is SECURITY DEFINER with an empty search_path and returns only the bounded website-safe projection (business name, representative website-visible branch address, admin settings, website_visible active providers/procedures) with zero clinical, patient, billing, workforce, internal, or audit data.",
  },
  {
    grantee: "anon",
    objectClass: "function",
    object: "public.get_public_site(text)",
    privilege: "execute",
    columns: [],
    reason:
      "The first deliberate public grant in the system (plan 012 / P12-02): a public clinic website must be readable by unauthenticated visitors. It returns only the bounded website-safe projection above, so the public surface cannot expose clinical or patient data. P13-02 adds the four booking RPCs as the second deliberate public surface.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.get_public_site_settings(uuid)",
    privilege: "execute",
    columns: [],
    reason:
      "The site.manage-gated read of the admin-editable public site settings. It derives the organization from an active authenticated acting branch, requires live site.manage (OWNER/ADMIN only), and returns the settings object plus the optimistic version.",
  },
  {
    grantee: "authenticated",
    objectClass: "function",
    object: "public.update_public_site_settings(uuid,integer,jsonb)",
    privilege: "execute",
    columns: [],
    reason:
      "The only site settings mutation path. It derives the organization from an active authenticated acting branch, requires live site.manage (OWNER/ADMIN only), accepts exactly the allowlisted settings keys with bounded values, applies an optimistic version, and appends one site.settings_updated audit event with empty metadata.",
  },
]);

/**
 * Grant-terminal migrations, in migration order.
 *
 * Every other migration file must contain no GRANT at all. When a future phase
 * needs new privileges, register its final file here together with its exact
 * approved grant set — that registration is the review gate.
 */
const BILLING_RPCS_GRANTS_MIGRATION = "20260828010501_billing_rpcs_grants.sql";
const BILLING_RPC_CORRECTIONS_GRANTS_MIGRATION = "20260828010503_billing_rpcs_corrections_grants.sql";
const BILLING_PROCEDURE_SUMMARY_GRANTS_MIGRATION = "20260828010601_billing_procedure_summary_rpc_grants.sql";
const FINANCIAL_ANALYTICS_GRANTS_MIGRATION = "20260828010701_financial_analytics_rpcs_grants.sql";
const BILLING_PROCEDURE_CONFIGURATION_RPCS_GRANTS_MIGRATION = "20260828010505_billing_procedure_configuration_rpcs_grants.sql";
const billingRpcGrants = Object.freeze([
  "public.list_patient_account(uuid,uuid)",
  "public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)",
  "public.post_charge_with_attribution_override(uuid,uuid,uuid,date,uuid,uuid,bigint,uuid,boolean,text,text,text)",
  "public.correct_charge_attribution(uuid,uuid,uuid,date,text,text)",
  "public.void_charge(uuid,uuid,text,text)",
  "public.approve_charge_direct_cost(uuid,uuid,text,bigint,text,text)",
  "public.reverse_charge_direct_cost(uuid,uuid,text,text)",
  "public.post_charge_adjustment(uuid,uuid,text,bigint,text,text)",
  "public.reverse_charge_adjustment(uuid,uuid,text,text)",
  "public.record_payment(uuid,uuid,uuid,bigint,text,text)",
  "public.void_payment(uuid,uuid,text,text)",
  "public.allocate_payment(uuid,uuid,uuid,uuid,bigint,text)",
  "public.reverse_payment_allocation(uuid,uuid,bigint,text,text)",
  "public.refund_payment(uuid,uuid,uuid,bigint,text,jsonb,text)",
  "public.record_postdated_cheque(uuid,uuid,text,text,bigint,date,jsonb,text)",
  "public.transition_postdated_cheque(uuid,uuid,text,text,text)",
  "public.clear_postdated_cheque(uuid,uuid,text)",
  "public.list_payment_methods(uuid)",
  "public.upsert_payment_method(uuid,text,text,boolean,uuid,integer,text)",
  "public.set_provider_compensation_agreement(uuid,uuid,date,date,integer,text,text)",
  "public.list_unresolved_charge_compensation(uuid,uuid)",
  "public.resolve_charge_compensation(uuid,uuid,text,text)",
  "public.list_provider_earnings(uuid,uuid,date,date)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  reason: "The narrow B6 billing boundary derives tenant and actor server-side, reauthorizes every operation, keeps base-table access denied, and writes the bounded audit event atomically with each mutation.",
})));

const billingProcedureConfigurationRpcGrants = Object.freeze([
  "public.set_procedure_default_fee(uuid,uuid,integer,bigint)",
  "public.list_procedure_direct_cost_defaults(uuid,uuid,boolean)",
  "public.create_procedure_direct_cost_default(uuid,uuid,text,text,bigint)",
  "public.update_procedure_direct_cost_default(uuid,uuid,integer,text,text,bigint)",
  "public.deactivate_procedure_direct_cost_default(uuid,uuid,integer)",
].map((object) => ({
  grantee: "authenticated",
  objectClass: "function",
  object,
  privilege: "execute",
  columns: [],
  reason: "The B6/B7 corrective procedure financial-configuration boundary derives the organization from the active acting branch, requires live billing.adjust, locks versioned same-tenant targets, keeps base-table access denied, and records bounded audit metadata atomically for mutations.",
})));

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
  Object.freeze({
    file: SCHEDULING_READS_GRANTS_MIGRATION,
    grants: schedulingReadsGrants,
  }),
  Object.freeze({
    file: QUEUE_RPCS_GRANTS_MIGRATION,
    grants: queueRpcGrants,
  }),
  Object.freeze({
    file: COMMUNICATION_RPCS_GRANTS_MIGRATION,
    grants: communicationRpcGrants,
  }),
  Object.freeze({
    file: REQUEUE_COMMUNICATION_GRANTS_MIGRATION,
    grants: requeueCommunicationGrants,
  }),
  Object.freeze({
    file: CALENDAR_SYNC_RPCS_GRANTS_MIGRATION,
    grants: calendarSyncRpcGrants,
  }),
  Object.freeze({
    file: SPECIALIST_REQUEST_RPCS_GRANTS_MIGRATION,
    grants: specialistRequestRpcGrants,
  }),
  Object.freeze({
    file: DOCUMENT_RPCS_GRANTS_MIGRATION,
    grants: documentRpcGrants,
  }),
  Object.freeze({
    file: SITE_RPCS_GRANTS_MIGRATION,
    grants: siteRpcGrants,
  }),
  Object.freeze({
    file: BOOKING_PUBLIC_RPCS_GRANTS_MIGRATION,
    grants: bookingPublicRpcGrants,
  }),
  Object.freeze({
    file: BOOKING_REVIEW_RPCS_GRANTS_MIGRATION,
    grants: bookingReviewRpcGrants,
  }),
  Object.freeze({
    file: CLINICAL_RPCS_GRANTS_MIGRATION,
    grants: clinicalRpcGrants,
  }),
  Object.freeze({
    file: ODONTOGRAM_RPCS_GRANTS_MIGRATION,
    grants: odontogramRpcGrants,
  }),
  Object.freeze({
    file: TREATMENT_PLAN_RPCS_GRANTS_MIGRATION,
    grants: treatmentPlanRpcGrants,
  }),
  Object.freeze({
    file: DOCUMENT_TREATMENT_PLAN_GRANTS_MIGRATION,
    grants: Object.freeze([
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.generate_document(uuid,uuid,text,jsonb)",
        privilege: "execute",
        columns: [],
        reason:
          "Restores the exact 20260827012201 terminal EXECUTE grant that the P16-03 TREATMENT_PLAN document extension cancelled when it recreated the generate_document definition to snapshot same-tenant treatment plans (header plus gated items/alternatives/discussions/drawing). The approved final privilege set is unchanged: no new grantable object is introduced and authorization remains entirely inside the SECURITY DEFINER body.",
      },
    ]),
  }),
  Object.freeze({
    file: INTAKE_RPCS_GRANTS_MIGRATION,
    grants: intakeRpcGrants,
  }),
  Object.freeze({
    file: INTAKE_CONSENT_TEMPLATES_RPC_GRANTS_MIGRATION,
    grants: intakeConsentTemplatesRpcGrants,
  }),
  Object.freeze({
    file: RECALL_RPCS_GRANTS_MIGRATION,
    grants: recallRpcGrants,
  }),
  Object.freeze({
    file: INVENTORY_RPCS_GRANTS_MIGRATION,
    grants: inventoryRpcGrants,
  }),
  Object.freeze({
    file: INVENTORY_TRANSFER_READ_GRANTS_MIGRATION,
    grants: inventoryTransferReadGrants,
  }),
  Object.freeze({
    file: OPERATIONAL_ANALYTICS_GRANTS_MIGRATION,
    grants: operationalAnalyticsGrants,
  }),
  Object.freeze({
    file: BILLING_RPCS_GRANTS_MIGRATION,
    grants: billingRpcGrants,
  }),
  Object.freeze({
    file: BILLING_RPC_CORRECTIONS_GRANTS_MIGRATION,
    grants: billingRpcGrants.filter((grant) =>
      [
        "public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)",
        "public.clear_postdated_cheque(uuid,uuid,text)",
      ].includes(grant.object),
    ),
  }),
  Object.freeze({
    file: BILLING_PROCEDURE_CONFIGURATION_RPCS_GRANTS_MIGRATION,
    grants: billingProcedureConfigurationRpcGrants,
  }),
  Object.freeze({
    file: BILLING_PROCEDURE_SUMMARY_GRANTS_MIGRATION,
    grants: [
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.summarize_procedure_charges(uuid,uuid,uuid)",
        privilege: "execute",
        columns: [],
        reason:
          "The bounded per-procedure patient payment projection derives tenant and actor server-side, requires billing.read at the charge-origin branch, and returns only the agreed five-amount DTO plus the payment status without mutating any ledger table.",
      },
    ],
  }),
  Object.freeze({
    file: FINANCIAL_ANALYTICS_GRANTS_MIGRATION,
    grants: [
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.get_financial_summary(uuid,uuid,date,date)",
        privilege: "execute",
        columns: [],
        reason:
          "The bounded signed event-period financial summary derives tenant and actor server-side, requires financial.analytics.read (or compensation.manage) at the acting branch, and returns only the agreed metric/amount DTOs without mutating any ledger table.",
      },
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.list_pending_pdc(uuid,uuid)",
        privilege: "execute",
        columns: [],
        reason:
          "The bounded pending PDC report derives tenant and actor server-side, requires billing.read at the acting branch, and returns only the agreed cheque DTO for the same organization.",
      },
    ],
  }),
  Object.freeze({
    file: ODONTOGRAM_O5_RPCS_GRANTS_MIGRATION,
    grants: odontogramO5Grants,
  }),
  Object.freeze({
    file: TREATMENT_ESTIMATE_CENTAVO_REPAIR_MIGRATION,
    grants: treatmentEstimateCentavoRepairGrants,
  }),
  Object.freeze({
    file: TREATMENT_ESTIMATE_PROJECTION_CONTRACT_MIGRATION,
    grants: treatmentEstimateProjectionContractGrants,
  }),
  Object.freeze({
    file: TREATMENT_ESTIMATE_PROJECTION_BOUNDS_MIGRATION,
    grants: treatmentEstimateProjectionBoundsGrants,
  }),
  Object.freeze({
    file: ODONTOGRAM_RESOLUTION_RPC_GRANT_MIGRATION,
    grants: odontogramResolutionRpcGrant,
  }),
  Object.freeze({
    file: ODONTOGRAM_CLINICAL_EVENT_LINEAGE_GRANT_MIGRATION,
    grants: odontogramClinicalEventLineageGrants,
  }),
  Object.freeze({
    file: ODONTOGRAM_CLINICAL_RPC_QUALIFICATION_GRANT_MIGRATION,
    grants: odontogramClinicalRpcQualificationGrants,
  }),
  Object.freeze({
    file: ODONTOGRAM_CLINICAL_AUDIT_METADATA_GRANT_MIGRATION,
    grants: odontogramClinicalAuditMetadataGrant,
  }),
  Object.freeze({
    file: ODONTOGRAM_O5_O8_TERMINAL_GRANTS_MIGRATION,
    grants: odontogramO5O8TerminalGrants,
  }),
  Object.freeze({
    file: ODONTOGRAM_O5_O8_FINAL_RECONCILIATION_GRANTS_MIGRATION,
    grants: odontogramO5O8FinalReconciliationGrants,
  }),
  Object.freeze({
    file: ODONTOGRAM_O5_O8_SERIALIZED_FINAL_GRANTS_MIGRATION,
    grants: odontogramO5O8FinalReconciliationGrants,
  }),
  Object.freeze({
    file: ODONTOGRAM_FEATURE_DETAILS_RPC_GRANTS_MIGRATION,
    grants: Object.freeze([{
      grantee: "authenticated",
      objectClass: "function",
      object: "public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text)",
      privilege: "execute",
      columns: [],
      reason: "O2 narrow audited clinical-entry write boundary; derives tenant from an authorized active branch, atomically persists constrained detail/history, and provides actor-scoped idempotency without base-table grants.",
    }]),
  }),
  Object.freeze({
    file: PROCEDURE_CASE_PLAN_DETAIL_GRANTS_MIGRATION,
    grants: Object.freeze([{
      grantee: "authenticated",
      objectClass: "function",
      object: "public.get_treatment_plan_detail(uuid,uuid)",
      privilege: "execute",
      columns: [],
      reason: "Restores the existing bounded treatment-plan detail read after its projection gains renderer-independent structured item details and an optional same-tenant procedure-case link; authorization remains clinical.read at the active acting branch and no base-table grant is introduced.",
    }]),
  }),
  Object.freeze({
    file: PROCEDURE_CASE_PLAN_DETAIL_RPC_GRANTS_MIGRATION,
    grants: Object.freeze([
      {
        grantee: "authenticated", objectClass: "function",
        object: "public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text)",
        privilege: "execute", columns: [],
        reason: "Adds bounded renderer-independent priority, sequence, surfaces, and notes only through the existing audited clinical-write and optimistic-version item creation boundary; tenant and branch derive inside the delegated writer.",
      },
      {
        grantee: "authenticated", objectClass: "function",
        object: "public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text)",
        privilege: "execute", columns: [],
        reason: "Updates bounded renderer-independent structured item detail only through the existing audited clinical-write and optimistic-version item update boundary; frozen plan checks remain in the delegated writer.",
      },
    ]),
  }),
  Object.freeze({ file: TREATMENT_PLAN_DETAIL_PRESENCE_RPC_GRANTS_MIGRATION, grants: Object.freeze([
    { grantee: "authenticated", objectClass: "function", object: "public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text,boolean,boolean,boolean,boolean)", privilege: "execute", columns: [], reason: "Presence-aware structured draft item creation delegates tenant, branch, authorization, versioning, and audit to the reviewed clinical writer before persisting bounded detail." },
    { grantee: "authenticated", objectClass: "function", object: "public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text,boolean,boolean,boolean,boolean)", privilege: "execute", columns: [], reason: "Presence-aware structured draft item patch delegates tenant, branch, authorization, versioning, frozen-plan protection, and audit to the reviewed clinical writer." },
  ]) }),
  Object.freeze({ file: ODONTOGRAM_REVAMP_RPCS_GRANTS_MIGRATION, grants: odontogramRevampRpcGrants }),
  Object.freeze({ file: ODONTOGRAM_REVAMP_TERMINAL_REPAIR_GRANTS_MIGRATION, grants: odontogramRevampRpcGrants.filter((grant) => ["public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,text)", "public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,text)"].includes(grant.object)) }),
  Object.freeze({ file: ODONTOGRAM_REVAMP_IMPLANT_CHARGE_GRANTS_MIGRATION, grants: Object.freeze([{ grantee: "authenticated", objectClass: "function", object: "public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,uuid,text)", privilege: "execute", columns: [], reason: "Provider-free current implant writer retains a validated same-patient charge link while deriving provider server-side." }]) }),
  Object.freeze({ file: ODONTOGRAM_REVAMP_DIRECT_CHARGE_AND_BRIDGE_GRANTS_MIGRATION, grants: Object.freeze([{ grantee: "authenticated", objectClass: "function", object: "public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,uuid,text)", privilege: "execute", columns: [], reason: "Provider-free current bridge writer retains a validated same-patient charge link while deriving provider server-side." }]) }),
  Object.freeze({ file: PROCEDURE_INSTALLMENT_SCHEDULE_GRANTS_MIGRATION, grants: Object.freeze([{ grantee: "authenticated", objectClass: "function", object: "public.create_procedure_installment_schedule(uuid,uuid,jsonb,text)", privilege: "execute", columns: [], reason: "Authenticated users reach the expectation-only schedule writer through its server-authorized action and narrow audited RPC." }, { grantee: "authenticated", objectClass: "function", object: "public.record_payment(uuid,uuid,uuid,bigint,text,text)", privilege: "execute", columns: [], reason: "Re-grants the existing narrow payment RPC after the dentist clinical-access guard replacement." }]) }),
  Object.freeze({ file: PROCEDURE_INSTALLMENT_SCHEDULE_LIFECYCLE_GRANTS_MIGRATION, grants: Object.freeze([{ grantee: "authenticated", objectClass: "function", object: "public.create_procedure_installment_schedule(uuid,uuid,jsonb,text)", privilege: "execute", columns: [], reason: "Restores the schedule writer only after its idempotency and lifecycle definition has been replaced." }]) }),
  Object.freeze({ file: PROCEDURE_INSTALLMENT_SCHEDULE_AMENDMENT_GRANTS_MIGRATION, grants: Object.freeze([{ grantee: "authenticated", objectClass: "function", object: "public.amend_procedure_installment_schedule(uuid,uuid,text,jsonb,text,text)", privilege: "execute", columns: [], reason: "Authenticated users can append a bounded schedule lifecycle successor without mutating payment allocations." }]) }),
  Object.freeze({ file: PROCEDURE_INSTALLMENT_SCHEDULE_IDEMPOTENCY_REPAIR_GRANTS_MIGRATION, grants: Object.freeze([
    { grantee: "authenticated", objectClass: "function", object: "public.create_procedure_installment_schedule(uuid,uuid,jsonb,text)", privilege: "execute", columns: [], reason: "Restores the bounded expectation-only writer after durable request-fingerprint replay is added; tenant and actor derive inside the RPC." },
    { grantee: "authenticated", objectClass: "function", object: "public.amend_procedure_installment_schedule(uuid,uuid,text,jsonb,text,text)", privilege: "execute", columns: [], reason: "Restores the bounded schedule lifecycle writer after canonical idempotent replay and input validation are added." },
    { grantee: "authenticated", objectClass: "function", object: "public.record_payment(uuid,uuid,uuid,bigint,text,text)", privilege: "execute", columns: [], reason: "Restores the existing payment boundary after durable replay validation; receipt attribution remains server-derived from auth.uid()." },
  ]) }),
  Object.freeze({ file: PROCEDURE_INSTALLMENT_SCHEDULE_IDEMPOTENCY_CONCURRENCY_GRANTS_MIGRATION, grants: Object.freeze([
    { grantee: "authenticated", objectClass: "function", object: "public.create_procedure_installment_schedule(uuid,uuid,jsonb,text)", privilege: "execute", columns: [], reason: "Restores the schedule writer after its request-key serialization wrapper prevents same-key concurrent create races." },
    { grantee: "authenticated", objectClass: "function", object: "public.amend_procedure_installment_schedule(uuid,uuid,text,jsonb,text,text)", privilege: "execute", columns: [], reason: "Restores the schedule lifecycle writer after its request-key serialization wrapper prevents same-key concurrent lifecycle races." },
    { grantee: "authenticated", objectClass: "function", object: "public.record_payment(uuid,uuid,uuid,bigint,text,text)", privilege: "execute", columns: [], reason: "Restores the payment writer after its request-key serialization wrapper makes exact retries safe without changing the immutable ledger." },
  ]) }),
  Object.freeze({ file: PROCEDURE_INSTALLMENT_SCHEDULE_LIFECYCLE_ORDERING_GRANTS_MIGRATION, grants: Object.freeze([
    { grantee: "authenticated", objectClass: "function", object: "public.create_procedure_installment_schedule(uuid,uuid,jsonb,text)", privilege: "execute", columns: [], reason: "Restores the schedule writer after organization-and-actor scoped request-key serialization replaces branch-scoped locking." },
    { grantee: "authenticated", objectClass: "function", object: "public.amend_procedure_installment_schedule(uuid,uuid,text,jsonb,text,text)", privilege: "execute", columns: [], reason: "Restores the lifecycle writer after transactional predecessor cancellation is ordered before active successor insertion." },
  ]) }),
  Object.freeze({ file: ODONTOGRAM_DTO_FEATURE_DETAIL_GRANTS_MIGRATION, grants: Object.freeze([
    {
      grantee: "authenticated",
      objectClass: "function",
      object: "public.get_patient_odontogram(uuid,uuid)",
      privilege: "execute",
      columns: [],
      reason: "Restores the reviewed authenticated clinical-read boundary after the bounded DTO projection replacement adds constrained renderer-independent feature detail; base clinical tables remain inaccessible to browser roles.",
    },
  ]) }),
  Object.freeze({ file: ATOMIC_CASE_COMPLETION_GRANTS_MIGRATION, grants: Object.freeze([{
    grantee: "authenticated", objectClass: "function", object: "public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text)", privilege: "execute", columns: [],
    reason: "O8/O9 completion boundary derives tenant and signed-in provider server-side, checks live clinical and charge permissions, atomically posts the immutable charge, materializes clinical state, resolves only explicit findings, and serializes idempotent retries.",
  }, {
    grantee: "authenticated", objectClass: "function", object: "public.get_patient_odontogram(uuid,uuid)", privilege: "execute", columns: [],
    reason: "Restores the existing bounded renderer-independent clinical DTO after its O8 projection replacement; base tables remain unavailable to browser roles.",
  }]) }),
  Object.freeze({ file: TREATMENT_PLAN_COMPLETION_CONTEXT_GRANTS_MIGRATION, grants: Object.freeze([{
    grantee: "authenticated", objectClass: "function", object: "public.get_treatment_plan_completion_context(uuid,uuid)", privilege: "execute", columns: [],
    reason: "O8/O9 bounded completion-context read derives the acknowledged plan, patient, open in-progress case/version, unresolved findings, signed-in active dentist, and immutable bridge/implant design server-side before the browser may offer completion; it grants no base-table access.",
  }]) }),
  Object.freeze({
    file: CLINICAL_PHOTO_RPCS_GRANTS_MIGRATION,
    grants: clinicalPhotoRpcGrants,
  }),
  Object.freeze({
    file: CLINICAL_PHOTO_PROCESSING_LIFECYCLE_GRANTS_MIGRATION,
    grants: Object.freeze([
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.claim_clinical_photo_processing(uuid,uuid)",
        privilege: "execute",
        columns: [],
        reason: "Claims a same-tenant clinical photo under clinical.write, derives the canonical source key server-side, and advances processing state with an attributable lifecycle audit event.",
      },
      {
        grantee: "authenticated",
        objectClass: "function",
        object: "public.fail_clinical_photo_processing(uuid,uuid)",
        privilege: "execute",
        columns: [],
        reason: "Idempotently records an attributed failed clinical-photo processing attempt under clinical.write without storing protected failure details.",
      },
    ]),
  }),
  Object.freeze({
    file: CLINICAL_PHOTO_SERVER_COMPLETION_GRANTS_MIGRATION,
    grants: Object.freeze([
      {
        grantee: "service_role",
        objectClass: "function",
        object:
          "public.complete_clinical_photo_derivatives(uuid,uuid,uuid,text,bigint,jsonb)",
        privilege: "execute",
        columns: [],
        reason:
          "Server-only clinical-photo completion boundary. The worker calls it only after reading and hashing every private derivative through the storage adapter; the explicit actor parameter preserves attributable audit events while no browser role can fabricate READY metadata.",
      },
    ]),
  }),
  Object.freeze({
    file: CLINICAL_PHOTO_ACTION_RPCS_GRANTS_MIGRATION,
    grants: Object.freeze([
      "public.create_clinical_photo_source_upload(uuid,uuid,text,bigint)",
      "public.get_clinical_photo_source_upload(uuid,uuid,uuid)",
      "public.confirm_clinical_photo_source_upload(uuid,uuid,uuid,integer,bigint)",
      "public.get_clinical_photo_derivative(uuid,uuid,uuid,text)",
      "public.archive_clinical_photo(uuid,uuid,uuid,integer,text)",
    ].map((object) => ({
      grantee: "authenticated",
      objectClass: "function",
      object,
      privilege: "execute",
      columns: [],
      reason:
        "The narrow clinical-photo action boundary derives tenant and patient association inside SECURITY DEFINER RPCs, requires the appropriate live clinical permission (and AAL2 for archival), preserves private opaque objects, and returns no base-table access or original client filename.",
    }))),
  }),
  Object.freeze({
    file: CLINICAL_ENCOUNTER_ACTOR_PROVIDER_GRANTS_MIGRATION,
    grants: clinicalEncounterActorProviderGrants,
  }),
  Object.freeze({
    file: UNIFIED_CLINICAL_VISIT_LIFECYCLE_GRANTS_MIGRATION,
    grants: unifiedClinicalVisitLifecycleGrants,
  }),
  Object.freeze({
    file: UNIFIED_CLINICAL_VISIT_LIFECYCLE_LOCK_SEED_GRANTS_MIGRATION,
    grants: unifiedClinicalVisitLifecycleLockSeedGrants,
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
