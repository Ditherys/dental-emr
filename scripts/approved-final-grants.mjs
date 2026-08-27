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

const ODONTOGRAM_RPCS_GRANTS_MIGRATION =
  "20260827013201_odontogram_rpcs_grants.sql";

const odontogramRpcGrants = Object.freeze([
  "public.create_tooth_condition(uuid,uuid,text,text,text,text,text)",
  "public.void_tooth_condition(uuid,uuid,integer,text)",
  "public.list_tooth_conditions(uuid,uuid,boolean)",
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only odontogram/dental-chart boundary. Functions derive the tenant and actor from an active authenticated acting branch and require live patient.clinical.write (mutations) or patient.clinical.read (bounded projection). Conditions carry validated FDI tooth codes and bounded vocabularies, are versioned, and are voided rather than deleted; terminal COMPLETED/REFERRED rows are kept as history and refused for voiding. Every mutation appends one atomic bounded-metadata audit event while the list writes none." })));

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
].map((object) => ({ grantee: "authenticated", objectClass: "function", object, privilege: "execute", columns: [], reason: "The only clinical data boundary. Functions derive the tenant and actor from an active authenticated acting branch and require live patient.clinical.write (mutations) or patient.clinical.read (bounded projections). Encounter/note/prescription rows carry an immutable FINALIZED state guarded by database triggers; finalized notes and prescriptions are only ever amended or recreated, never silently overwritten. Every mutation appends one atomic bounded-metadata audit event while the read projections write none." })));

const DOCUMENT_RPCS_GRANTS_MIGRATION =
  "20260827012201_document_rpcs_grants.sql";

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
