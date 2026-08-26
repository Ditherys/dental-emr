# AI Handoff - Phase 12 complete, Phase 13 next

> Rolling handoff between coding agents. The repository, approved plans,
> migrations, tests, ADRs, and Git history remain authoritative.

## Phase 12 checkpoint (2026-08-27) - ACCEPTED

Phase 12 (Clinic Website) complete through commit `c141255` (P12-04 public
website) with `docs/plans/012-clinic-website.md` P12-01..P12-05 all `[x]`.

- P12-01 `60712ab` site.manage permission (OWNER/ADMIN) + public_site_settings
  (hero/about/contact/hours/privacy/links, bounded). P12-02 `295153c`
  get_public_site(org_slug) — the SINGLE DELIBERATE anon-granted public RPC
  returning only website-safe fields (website_visible providers/procedures,
  settings; no-leakage pgTAP-proven against inserted patient/clinical data) +
  get/update settings RPCs (site.manage gated, versioned, audited). P12-03/04
  `c141255` src/lib/site services + public-resolver + /settings/site admin UI +
  rebuilt (public) home (hero/about/services/providers/contact/privacy/CTAs,
  mobile-first, SEO metadata, force-dynamic).
- Acceptance criteria met: mobile-first responsive; public site exposes no
  clinical data (keyset + no-clinical-string DOM tests); content from controlled
  website_visible fields; admin-editable without code.
- Inventory: 91 migration files, 31 grant terminals, 121 approved privileges
  (incl. the one deliberate anon grant on get_public_site); 53 pgTAP suites +
  4 concurrency probes; tables 46, functions 154, security-definer 130;
  unit 86 files / 885 tests; scripts 279.

**Next:** Phase 13 (Website Booking Integration) per docs/MASTER_PRODUCT_PLAN.md
§Phase 13. Author bounded plan docs/plans/013-website-booking.md then execute
P13-01.. . This is the highest-risk public booking surface (slot holds, no
double-booking, acquisition/campaign capture, secure management links).

## Phase 12 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 11 checkpoint (2026-08-27) - ACCEPTED (real PDF conversion NOT VERIFIED)

Phase 11 (Document & Print Engine) complete through commit `00146e3` (P11-04
renderer + print UI) with `docs/plans/011-document-print.md` P11-01..P11-05 all
`[x]`.

- P11-01 `e607687` document.generate/view permission contract
  (generate OWNER/ADMIN/DENTIST; view + RECEPTIONIST).
  P11-02/03 `7120f94` documents table (template_version + data_snapshot +
  include_set, snapshot object+size checks) + generate/list/get_snapshot RPCs +
  has_document_permission_at_branch; snapshot built server-side from authorized
  sections (demographics/referrals/appointments) per type; include-set controls
  configurable export (never blind full export); audit document.generated per
  generation; additive audit-metadata extension (document_type/include_set
  keys). P11-04 `00146e3` src/lib/documents services + render.ts (branded A4
  `@page`/`@media print` HTML, escaped) + /documents UI (patient picker,
  generate dialog with include-set checkboxes) + /documents/[id]/print route.
- Acceptance criteria met: A4 usable (print HTML route + print chrome-hidden
  shell); configurable export (include_set); clinic branding (org/branch
  rendered server-side); sensitive exports authorized/audited (document.generate
  + audit event); reproducible snapshot (template_version + data_snapshot
  byte-identical re-render, pgTAP-proven).
- Inventory: 88 migration files, 30 grant terminals, 117 approved privileges;
  49 pgTAP suites + 3 concurrency probes; tables 45, functions 150,
  security-definer 126; unit 79 files / 838 tests; scripts 279.
- **NOT VERIFIED / EXTERNAL DEPENDENCY:** PDF conversion. The A4 print HTML is
  the print-to-PDF seam.

**Next:** Phase 12 (Clinic Website) per docs/MASTER_PRODUCT_PLAN.md §Phase 12.
Author bounded plan docs/plans/012-clinic-website.md then execute P12-01.. .

## Phase 11 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 11 checkpoint (2026-08-27) - P11-04 IMPLEMENTED, not committed

P11-04 (server renderer + services + print UI) per `docs/plans/011-document-print.md`
is implemented on top of commits `7120f94` (P11-02 schema) and `7120f94` (P11-03
RPCs). Working tree only; nothing committed.

- `src/lib/documents/` server services mirroring `src/lib/specialist/`:
  - `include-set.ts` (client-safe, single source of truth): 3 document types,
    per-type include-set section allowlists, human labels.
  - `schema.ts` (server-only): strict input schemas (`generateDocumentInputSchema`
    as a discriminated union keyed on documentType with per-type strict
    boolean-value include-set objects; `listDocumentsInputSchema`;
    `getDocumentSnapshotInputSchema`), output row schemas for the 3 RPCs
    (`documentMutationRowSchema`, `documentListRowSchema`, `documentSnapshotRowSchema`
    with structured `documentDataSnapshotSchema` sections), and RPC allowlists reused
    exactly: PATIENT_RECORD_SUMMARY -> demographics/referrals/appointments,
    APPOINTMENT_SLIP -> demographics/appointments, REFERRAL_LETTER ->
    demographics/referrals.
  - `types.ts`: DTO types (camelCase): DocumentType, DocumentRecord (no
    snapshot body), DocumentSnapshot, DocumentDataSnapshot, DocumentMutationResult.
  - `errors.ts`: DocumentServiceError + mapDocumentRpcError (NOT_AUTHORIZED/
    INVALID_INPUT/FAILED).
  - `service.ts`: server-only generateDocument/listDocuments/getDocumentSnapshot
    with exact p_* args; **normalizes include-set to truthy keys only** before
    calling generate_document because the RPC builds snapshot sections on key
    *presence* not value — a deselected (false) section can never leak.
  - `render.ts`: server-only pure `renderDocumentHtml({ documentType,
    templateVersion, dataSnapshot, orgName, branchName })` -> clinic-branded A4
    print HTML string (`@page { size: A4; margin: 18mm }`, `@media print`,
    header org/branch/title, deterministic footer with template version, only
    the snapshot sections present, every value HTML-escaped via escapeHtml).
- UI:
  - `/documents` page: `requireVerifiedIdentity` + `document.view` (+branch
    recheck), `document.generate` gate for `canGenerate`, optional `?patientId=`
    query pre-selects a patient and server-loads their document list.
  - `documents-board.tsx` (client): patient picker (searchPatientsAction), dense
    desktop table / phone list (type, template version, generated at, include-set
    summary), Generate dialog (type select + per-type include-set checkboxes,
    >=1 section required), View/Print per row re-checks `getSnapshotAction` then
    opens `/documents/[id]/print`; all controls 44px (min-h-11/h-11).
  - `documents/actions.ts`: loadDocumentsAction (document.view+branch),
    generateDocumentAction (document.generate+branch+per-type include-set
    validation), getSnapshotAction (document.view+branch). revalidatePath
    `/documents`. No org identifiers accepted.
  - `documents/[documentId]/print/page.tsx`: server-gated A4 print route;
    orchestration extracted to `print-document.ts` `resolvePrintDocument`
    (auth recheck + snapshot + render) so the print logic is unit-testable.
  - Nav entry "Documents" (`FileText`, `document.view`).
  - `emr-shell.tsx`/`emr layout.tsx`: `print:hidden` on aside/header/Toaster and
    `print:p-0` on main so browser print of the print route emits the A4
    document without the app chrome.
- Tests: `service.test.ts`, `render.test.ts`, `actions.test.ts`,
  `documents-board.test.tsx`, `print-page.test.tsx` (5 files, 42 tests new).
  Covers
  RPC contract incl. include-set normalization, forbidden-key rejection per
  type, output parse failures, error mapping, list projection (no snapshot
  body), permission/branch reauthorization, generate validation + audit-mapped
  errors, phone/desktop render, 44px, escaping + A4/print CSS + branding,
  denied/failed/ready print resolution.
- Verification (2026-08-27): `npm run test:unit` 79 files / 838 tests pass,
  `npm run lint` clean, `npm run typecheck` clean, `npm run build` passes and
  emits `/documents` and `/documents/[documentId]/print`, `git diff --check`
  clean, `security:migrations` (30 terminals/117 privileges, unchanged),
  `security:secrets` clean. No new migrations/RPCs. No Cloud/prod target used.
- Deviations: (1) `renderDocumentHtml` takes no generated timestamp (RPC
  snapshot row has none); footer is deterministic ("Prepared from the structured
  EMR record · Template v1 · Reproducible snapshot"). (2) service strips
  false-valued include-set keys before the RPC (see above). (3) print route
  renders via `dangerouslySetInnerHTML` of server-authored escaped HTML (safe by
  construction; all snapshot text escaped in render). (4) `/documents` list is
  patient-scoped per plan (list RPC requires patient_id; no clinic-wide RPC
  added). (5) dates render as stored ISO date/time segment deterministically
  (no locale/timezone dependency).

## Phase 10 checkpoint (2026-08-27) - ACCEPTED

Phase 10 (Specialist / On-call Workflow) complete through commit `7ff5164`
(P10-04 specialist services + UI) with `docs/plans/010-specialist-oncall.md`
P10-01..P10-05 all `[x]`.

- P10-01 `b34fc24` specialist.request permission (OWNER/ADMIN/DENTIST/
  RECEPTIONIST). P10-02 `594a3d7` specialist_requests + status history (minimal
  bounded non-clinical case_summary, global-OR-org specialty scope trigger,
  status state machine SENT/ACCEPTED/ASSIGNED/DECLINED/
  ALTERNATE_TIME_REQUESTED/EXPIRED/CANCELLED). P10-03 `f08f552` create/respond/
  cancel/list RPCs + has_specialist_permission_at_branch; ACCEPT inserts
  appointment_providers SPECIALIST ASSIGNED + enqueues calendar CREATE +
  communication (acceptance triggers assignment + automation atomically);
  responder must be the requested provider's linked user OR org role.manage;
  bookability proven (find_available_slots = 0 for VISITING/ON_CALL provider
  with no availability rules). P10-04 `7ff5164` src/lib/specialist services +
  /specialists UI (request + respond + cancel; responder rule enforced
  server-side in RPC).
- Acceptance criteria met: on-call not automatically bookable; availability
  request carries minimal case_summary only (no clinical content); acceptance
  assigns provider + triggers calendar/communication automation.
- Inventory: 84 migration files, 29 grant terminals, 114 approved privileges;
  47 pgTAP suites + 3 concurrency probes; tables 44, functions 145,
  security-definer 122; unit 74 files / 795 tests; scripts 279.
- Phase gate verification all green: db test, security migrations/secrets/audit,
  unit, lint, typecheck, build (`/specialists` emitted).

**Next:** Phase 11 (Document & Print Engine) per docs/MASTER_PRODUCT_PLAN.md
§Phase 11 (initial templates: patient record summary, treatment estimate,
statement of account, prescription, referral letter, consent form, appointment
slip, treatment plan; A4, clinic branding, sensitive exports authorized/audited).
Author bounded plan docs/plans/011-document-print.md then execute P11-01.. .

## Phase 10 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 9 checkpoint (2026-08-27) - ACCEPTED (external Google behavior NOT VERIFIED)

Phase 9 (Google Calendar Integration) complete through commit `76f29ff`
(P9-05 calendar settings UI) with `docs/plans/009-google-calendar.md` P9-01..P9-06
all `[x]`.

- P9-01 `bce6a9d` calendar.manage permission (OWNER/ADMIN/DENTIST only).
  P9-02 `8a05af9` calendar_integrations (opaque google_account_ref, privacy
  modes, connection status) + calendar_event_links (stable external_event_id,
  unique appt+provider+op) + calendar_sync_jobs (durable queue, deterministic
  idempotency key). P9-03 `07835ee` sync RPCs (enqueue/list/claim/ack/fail/
  connect/disconnect/list integrations) + has_calendar_permission_at_branch +
  private enqueue internal + deferred appointment_calendar_sync_trigger
  (CREATE on insert for ASSIGNED providers with CONNECTED integration, CANCEL
  on cancel, UPDATE on reschedule; in-transaction enqueue only).
  P9-04 `951ec51` src/lib/calendar services + adapter abstraction (deterministic
  test adapter, stable `cal-<appt>-<provider>` id → no-duplicate; free/busy
  returns busy ranges only — no event details) + worker. P9-05 `76f29ff`
  /settings/calendar UI (integrations + sync jobs, connect/disconnect/re-sync,
  no event titles, 44px).
- Acceptance criteria met: EMR correct when adapter down (failure → job FAILED,
  appointment untouched); free/busy never exposes personal event details
  (type + tests); retry no-duplicate (stable id + unique link);
  tokens never reach browser (opaque ref, never returned by RPCs, no logging).
- Inventory: 80 migration files, 28 grant terminals, 110 approved privileges;
  46 pgTAP suites + 4 concurrency probes; tables 42, functions 139,
  security-definer 117; unit 71 files / 750 tests; scripts 279.
- **NOT VERIFIED / EXTERNAL DEPENDENCY:** real Google OAuth + Calendar API
  adapter. Only the provider-neutral interface and deterministic local test
  adapter are implemented. Cloud TEST is the deployment gate.

**Next:** Phase 10 (Specialist / On-call Workflow) per
docs/MASTER_PRODUCT_PLAN.md §Phase 10. Author bounded plan
docs/plans/010-specialist-oncall.md then execute P10-01.. .

## Phase 9 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 8 checkpoint (2026-08-27) - ACCEPTED

Phase 8 (Automation & Communication Core) complete through commit `c7df3da`
(P8-05 communications dashboard + requeue retry) with
`docs/plans/008-automation-communication.md` P8-01..P8-06 all `[x]`.

- P8-01 `6b3ccd4` communication.view/send permission contract (OWNER/ADMIN/
  RECEPTIONIST). P8-02 `6047668` communications table = durable job queue +
  history (QUEUED/SENT/DELIVERED/FAILED/CANCELLED, idempotency unique key,
  attempts/max_attempts/next_attempt_at, template-only bounded bodies).
  P8-03 `3681cb7` enqueue/cancel/list/acknowledge/fail/claim_due RPCs +
  has_communication_permission_at_branch helper + appointment automation
  triggers (CONFIRMATION on create/confirm, CANCELLATION + cancel-obsolete on
  cancel, RESCHEDULE on reschedule; idempotent keys; non-clinical templates;
  enqueue is in-transaction only, never blocking). P8-04 `4a83129`
  src/lib/communication services + worker + adapter abstraction (deterministic
  test adapter, idempotent by communicationId, retry/duplicate-send proven).
  P8-05 `c7df3da` /communications dashboard + requeue_communication RPC
  (FAILED-only manual retry copying stored content — resolves the masked-
  recipient retry data boundary).
- Acceptance criteria met: external send never blocks appointment save
  (in-transaction enqueue only); jobs retryable/idempotent; cancellation
  cancels obsolete reminders (trigger); staff see delivered/failed state
  (dashboard); duplicate-send tests pass.
- Inventory: 76 migration files, 27 grant terminals, 102 approved privileges;
  44 pgTAP suites + 4 concurrency probes; tables 39, functions 128,
  security-definer 106; unit 66 files / 693 tests; scripts 279.
- Phase gate verification all green: db test, security migrations/secrets/audit,
  unit, lint, typecheck, build (`/communications` emitted).

**Next:** Phase 9 (Google Calendar Integration) per
docs/MASTER_PRODUCT_PLAN.md §Phase 9. External OAuth + provider-neutral
calendar adapter with the deterministic local adapter; EMR→Google event sync,
retry no-duplicate, tokens never reach browser. Author bounded plan
docs/plans/009-google-calendar.md then execute P9-01.. .

## Phase 8 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 7 checkpoint (2026-08-27) - ACCEPTED

Phase 7 (Walk-in & Queue) complete through commit `d71ed5f` (P7-04 queue UI)
with `docs/plans/007-walkin-queue.md` P7-01..P7-05 all `[x]`.

- P7-01 `9e4d8cc` queue.read/queue.manage permission contract + queue_entries
  table (statuses WAITING/READY/CALLED/IN_CHAIR/COMPLETED/LEFT/CANCELLED,
  tenant-safe composite FKs, completed/left consistency checks). P7-02 `3d6b408`
  queue RPCs (create_walkin_entry/update_queue_status/list_queue) +
  has_queue_permission_at_branch helper; forward-only transitions, one atomic
  audit per mutation with stripped-null reason metadata. P7-03 `e1f96ec`
  src/lib/queue services. P7-04 `d71ed5f` /queue board UI + +Walk-in dialog.
- Acceptance criteria met: walk-in creates a queue entry not a fake
  appointment; receptionist sees current queue; queue transitions never touch
  appointment rows.
- Inventory: 70 migration files, 25 grant terminals, 95 approved privileges;
  40 pgTAP suites + 4 concurrency probes; tables 38, functions 117,
  security-definer 95; unit 61 files / 642 tests; scripts 279.
- Phase gate verification all green: db test, security migrations/secrets/audit,
  unit, lint, typecheck, build (`/queue` emitted).

**Next:** Phase 8 (Automation & Communication Core) per
docs/MASTER_PRODUCT_PLAN.md §Phase 8 (§16-17 reminder rules, durable queue/jobs,
communication table, email/SMS adapters, retries). Author bounded plan
docs/plans/008-automation-communication.md then execute P8-01.. .

## Phase 7 checkpoint (2026-08-27) - IN PROGRESS (historical)

## Phase 6 checkpoint (2026-08-27) - ACCEPTED

Phase 6 (Scheduling Engine) is complete through commit `72fbc43` (P6-09
calendar UI) with `docs/plans/006-scheduling-engine.md` P6-01..P6-10 all `[x]`.

- P6-01 `e3dd467` appointment.read/write permission contract. P6-02 `14b28bb`
  resource_types/branch_resources/resource_unavailability. P6-03 `d0a00db`
  provider_availability_rules/provider_schedule_exceptions. P6-04 `ae4dcc5`
  appointments + appointment_providers + appointment_resources +
  appointment_status_history (3 status dimensions). P6-05 `d752c8e`
  provider_reservations + resource_reservations with partial GiST EXCLUDE
  (btree_gist became the sole approved extension). P6-06 `59b5774` scheduling
  RPCs (create/reschedule/cancel/status/list) + private
  has_appointment_permission_at_branch + extended audit metadata allowlist +
  concurrency probe. P6-07 `b5b2565` list_availability/find_available_slots.
  P6-08 `7b36ee4` src/lib/scheduling services. P6-09 `72fbc43` /schedule
  calendar UI + actions.
- Inventory: 66 migration files, 24 grant terminals, 92 approved privileges,
  1 approved extension (btree_gist); 36 pgTAP suites + 4 concurrency probes
  (incl. appointment double-booking exclusion); tables 37, functions 113,
  security-definer 91; unit 58 files / 613 tests; scripts 279.
- Phase gate verification all green: db reset/provision/test, security:
  migrations/secrets/audit, unit, lint, typecheck, build (`/schedule` emitted).
- Acceptance criteria met: provider double-booking rejected (exclusion +
  concurrency test), resource conflicts prevented, appointment exists without
  provider while AWAITING_SPECIALIST, reschedule history via audit metadata +
  status history, cancellation releases reservation slots (proven in pgTAP).

**Next:** Phase 7 (Walk-in & Queue) per docs/MASTER_PRODUCT_PLAN.md §Phase 7.
Author a bounded plan (docs/plans/007-walkin-queue.md) then execute P7-01.. .

## Phase 6 checkpoint (2026-08-27) - IN PROGRESS (historical)

Phase 6 (Scheduling Engine) plan authored at `docs/plans/006-scheduling-engine.md`
with tasks P6-01..P6-10. Committed so far:

- P6-01 `e3dd467` appointment.read/write permission contract (OWNER/ADMIN/DENTIST/
  RECEPTIONIST both, DENTAL_ASSISTANT read only, VISITING_SPECIALIST/BILLING none).
- P6-02 `14b28bb` resource_types (global seed + org-custom, immutable global
  scope) + branch_resources (tenant-safe branch/resource_type FKs) +
  resource_unavailability; deny-by-default.
- P6-03 `d0a00db` provider_availability_rules + provider_schedule_exceptions
  (org-scoped composite FKs, weekday 0-6 DOW, exception types).
- P6-04 `ae4dcc5` appointments (3 status dimensions, composite FKs,
  cancelled/completed consistency checks) + appointment_providers +
  appointment_resources + appointment_status_history.
- P6-05 `d752c8e` provider_reservations + resource_reservations with generated
  `timespan tstzrange` and **partial GiST EXCLUDE** on (id WITH =, timespan WITH &&)
  WHERE status='ACTIVE'. Introduced **btree_gist** as the sole approved
  production extension (approved-final-grants APPROVED_EXTENSIONS + lint test
  updated). Exclusion rejections proven in pgTAP (23P01), back-to-back and
  cross-branch allowed, release/cancel frees slots.
- Inventory: 62 migration files, 22 grant terminals, 85 approved privileges,
  1 approved extension (btree_gist); 33 pgTAP suites; tables 37, functions 104.

**Next:** P6-06 appointment RPCs (create/reschedule/cancel/status/list) with
single-transaction conflict detection, reservation create/release, audit events,
terminal grants, pgTAP incl. concurrency. Then P6-07 read RPCs, P6-08 services,
P6-09 calendar UI, P6-10 phase gate.

## Phase 5 checkpoint (2026-08-27) - ACCEPTED

Phase 5 (Acquisition & Referrals Foundation) is complete through commit
`e03e57f` (P5-08 analytics report) with `docs/plans/005-acquisition-referrals.md`
P5-01..P5-09 all marked `[x]`.

- P5-01 catalogs (`c84093a`), P5-02 attribution columns (`a41068a`),
  P5-03 attribution RPCs (`56876bb`), P5-04 referral schema (`4493fcc`),
  P5-05 referral RPCs (`f38b063`), P5-06 services (`0caf234`),
  P5-07 registration/workspace UI (`7613738`), P5-08 analytics report (`e03e57f`).
- Deliverables: acquisition_sources/booking_channels catalogs + org-custom
  sources; patients attribution columns (tenant-safe source, same-org referrer,
  external snapshot, initial channel); create/update/list referral RPCs with
  optimistic versions + one atomic `{}` audit event each; `analytics.view`
  permission (OWNER/ADMIN only) + org-scoped aggregated report RPC
  `get_acquisition_summary(uuid,integer)` (30/90/365 window, counts only, no
  audit event); `/reports/acquisition` page + server actions; nav gated on
  `analytics.view`.
- Current inventory: 57 migration files, 22 grant terminals, 85 approved final
  privileges; 28 pgTAP suites + 3 concurrency probes; 55 unit files / 578 tests.
- Phase gate verification all green: `db:reset:local`, `db:provision:local`,
  `test:db:local` (28 suites), `security:migrations` (passed), `security:secrets`
  (clean), `security:audit` (0 vulns), `test:unit`, `lint`, `typecheck`,
  `build` (Compiled + 19/19 static pages).

## Current checkpoint

- **P5-07 registration and workspace UI is implemented but not committed.**
  `/patients/new` starts catalog reads from the existing server-authorized
  writable branch and renders the optional Acquisition section only when both
  bounded catalog adapters succeed. It includes catalog-backed discovery-source
  and booking-channel selects, a bounded existing-patient lookup through the
  existing authorization-rechecking directory action, and external referrer
  snapshot fields. Catalog failures safely omit the optional section; no public
  directory or organization value was introduced.
- `createPatient` now calls P5-03's explicit 18-argument `create_patient`
  overload with the strict optional attribution document. The patient creation
  schema rejects arbitrary attribution fields and competing internal/external
  referrers. The duplicate-read workflow continues to validate against the
  exported unrefined base schema because Zod cannot derive an omitted shape from
  a refined object schema.
- The workspace detail adapter now validates the P5-03 bounded attribution
  projection and renders it read-only. The route independently attempts the
  referral list after the core patient record; expected acquisition/authorization
  errors degrade only that section to a safe alert. `ReferralsSection` provides
  responsive semantic table/phone-list views, a dialog-based create flow, and
  allowed status controls with 44px targets. Its route-local actions validate
  input, recheck `patient.demographics.write` plus the submitted acting branch,
  and call only P5-06 services; they accept no organization identifier.
- P5-07 tests cover attribution schema/adapter shape, registration submission,
  workspace read-only attribution rendering, and referral create action branch
  reauthorization. Verification (2026-08-26): focused patient tests, `npm run
  test:unit` (54 files, 569 tests), `npm run lint`, `npm run typecheck`, and
  `npm run build` passed. No database migration or hosted target was used. The
  pre-existing untracked `.playwright-cli/` directory remains untouched.
- P5-07 review fixes: conflicting internal/external referrers now attach a
  visible, accessible error to the external-referrer field in both client and
  server validation. Registration referrer lookup and referral create/status
  handlers catch rejected action promises, show safe failures, and clear their
  saving state in `finally`. Form controls in the affected registration and
  referral dialogs remain 44px at every breakpoint. Focused component/action
  tests now prove referrer conflict/search rejection, referral create/status
  rejection recovery, and status-action branch reauthorization.

- **P5-06 is implemented but not committed.** `src/lib/acquisition/` adds
  server-only Zod schemas, DTO types, safe error mapping, and authenticated
  Supabase RPC services for catalog reads, attribution update, and referral
  create/status/list. Every input and RPC DTO is validated; no caller supplies
  an organization value. Offline mocked-Supabase unit coverage proves exact RPC
  contracts, input/mass-assignment rejection, DTO mapping, and safe errors.
- P5-06 found no existing safe catalog-read RPC: base catalog table privileges
  are deliberately zero. `20260826011700_acquisition_catalog_reads.sql` adds
  only `list_acquisition_sources(uuid)` and `list_booking_channels(uuid)`. Both
  are authenticated `SECURITY DEFINER` reads with empty paths, derive the org
  from an active acting branch, require live `patient.demographics.read`, return
  active bounded DTOs only, and expose no org field. `20260826011701` grants
  EXECUTE only to `authenticated`; the approved privilege registry and static
  inventory tests now reflect 55 migrations, 100 functions, 81 definers, 21
  grant terminals, 84 final privileges, and 67 browser-reachable grants.
- P5-06 verification (2026-08-26): focused acquisition Vitest plus full
  `npm run test:unit` passed (54 files, 566 tests); `npm run lint`, `npm run
  typecheck`, `npm run security:migrations`, `npm run security:secrets`, and
  `npm run security:audit` passed. Fresh synthetic-only local reset/provision
  and `test:db:local` passed 27 pgTAP suites plus three concurrency probes. No
  hosted or production target was used. Pre-existing untracked `.playwright-cli/`
  artifacts remain untouched.

- **P5-05 is implemented but not committed.** `20260826011600_patient_referral_rpcs.sql`
  adds the three authenticated `SECURITY DEFINER` referral boundaries and
  `20260826011601_patient_referral_rpcs_grants.sql` is their sole terminal
  grant. Each derives the organization from the active acting branch and never
  accepts client organization/patient tenancy fields. Create accepts only a
  bounded allowlisted JSON document and always creates `RECEIVED`; status
  mutation locks the tenant referral/version and permits only
  `RECEIVED -> ACTIVE/CANCELLED` and `ACTIVE -> COMPLETED/CANCELLED`; list is a
  deterministic 200-row administrative projection. Mutations require live
  `patient.demographics.write`, reads require live
  `patient.demographics.read`, safe errors cover denied/missing/foreign rows,
  and each successful mutation atomically writes one `{}`-metadata referral
  audit event. No AAL2 or provider-management exception was introduced.
- `patient_referral_rpcs.test.sql` is registered in local/Cloud TEST runners.
  It proves exact ACLs, empty definer paths, owner positive flow, billing,
  anonymous-equivalent ACL, and foreign denials, allowlisted input, stale
  versions, transition restrictions, audit counts/rollback, and no list-read
  audit. The privilege and database-suite inventories now report 53 migrations,
  98 functions, 79 security-definer functions, 20 grant terminals, 82 approved
  final privileges, 65 browser-reachable grants, and 27 pgTAP suites.
- P5-05 local verification (2026-08-26): fresh `db:start:local` /
  `db:reset:local` / `db:provision:local` and `test:db:local` passed all 27
  pgTAP suites plus three concurrency probes. `npm run security:migrations`,
  `npm run lint`, `npm run typecheck`, and `npm run test:unit` (53 files, 561
  tests) passed. No hosted or production target was used; the pre-existing
  untracked `.playwright-cli/` directory remains untouched.

- **P5-04 is committed in `4493fcc`.** `20260826011500_patient_referrals.sql`
  adds only the referral foundation table and no RPCs: requested `org_id`,
  tenant-safe composite patient FK, `IN`/`OUT` directions, bounded
  `RECEIVED`/`ACTIVE`/`COMPLETED`/`CANCELLED` status, nullable required
  specialty, bounded external-party snapshot fields, 2000-character notes,
  optimistic version, and timestamps. Base grants remain revoked for PUBLIC,
  anon, authenticated, and service_role; the sole RLS policy reuses
  demographics-read visibility, while future P5-05 owns the RPC boundary.
- The specialty reference has a private `FOR KEY SHARE` scope trigger allowing
  global or same-org specialties only, with an empty search path and all
  execution revoked. The access path is `(org_id, patient_id, status)`.
- `patient_referrals_foundation.test.sql` is registered in the local/Cloud TEST
  runner and proves schema, constraints, foreign-patient rejection,
  global/own/foreign specialty integrity, RLS isolation, zero base grants,
  index shape, and trigger hardening. Static test inventories were increased to
  51 migrations, 26 tables, 95 functions, 25 policies, and 26 pgTAP suites.
- P5-04 verification (2026-08-26): `npm run security:migrations`, fresh
  `db:start:local` / `db:reset:local` / `db:provision:local` /
  `test:db:local` (26 suites + 3 concurrency probes), `npm run lint`,
  `npm run typecheck`, and `npm run test:unit` (53 files, 561 tests) passed.
  No hosted or production target was used. The pre-existing untracked
  `.playwright-cli/` directory was not changed.

- **Phase 4 (patient file attachment foundation) is functionally complete and
  phase-reviewed.** All plan tasks P4-01..P4-09 are delivered; Cloud TEST
  remains the mandatory pre-production gate before any production use.
- P4-09 (this checkpoint) closed the local integration loop:
  - MinIO browser CORS is pinned at container create via `MINIO_API_CORS_*`
    env vars (this MinIO release removed the S3 bucket-CORS API — verified
    live `PutBucketCors` returns NotImplemented). `npm run storage:start:local`
    recreates a legacy/unpinned container once (volume data kept), then proves
    an OPTIONS preflight for origin `http://127.0.0.1:3000` before PASS.
  - `npm run storage:smoke:local` runs a guarded live flow against real MinIO:
    put -> stat -> get -> presign (structure only; URLs never printed) ->
    browser-style OPTIONS + PUT + GET from the app origin -> delete ->
    stat-fails. It uses `scripts/local-node-ts-loader.mjs` so plain Node can
    import the real server-only adapter via the existing vitest stub.
- Phase review found and fixed one real cross-boundary defect: the page CSP
  `connect-src` did not include the storage endpoint, so in-browser presigned
  PUTs were blocked despite the CORS smoke passing from Node.
  `src/lib/security/browser-policy.ts` now appends a validated storage origin
  derived from `STORAGE_ENDPOINT`: exact-origin-only (no path/query/creds),
  production requires HTTPS, and the local posture (`appEnvironment=development`
  + `supabaseProjectId=local`) accepts ONLY exactly `http://127.0.0.1:9000`.
  Proven by new browser-policy tests and `npm run build` with `.env.local`.
- Deferred with recorded rationale (phase-review dispositions):
  - Download audit event: no app-side audit writer exists anywhere yet; needs
    an explicit audited RPC/event design before the plan's download-audit
    acceptance line can be met. Upload+archive are DB-audited atomically.
  - Post-confirm overwrite window: minted PUT URLs stay valid up to their 900s
    TTL after confirm; mitigations (re-key at confirm, short TTL, versioning)
    are deployment-readiness tooling alongside R2 derivative work.
  - checksum_sha256 stays NULL for RPC-created rows; `available` rows now
    carry a SERVER-verified size (confirm RPC takes HEAD-measured bytes;
    CHECK `file_objects_available_size_check` enforces presence). Full-object
    hash verification is deferred to deployment-readiness tooling.
  - Orphaned pending rows from failed presigns need future cleanup tooling.
- Final Phase 4 verification (2026-08-26): security:migrations (46 files, 18
  terminals, 76 privileges), lint, typecheck, vitest 53 files / 561 tests,
  db reset+provision+test:db:local (22 pgTAP suites + 3 concurrency probes),
  storage:start+smoke PASS, build PASS.

## P4-08 file attachment UI foundation

- P4-08 adds the patient Files section UI on top of the
  P4-07 services. New route-local files under
  `src/app/(emr)/patients/[patientId]/files/`:
  - `actions.ts`: `createFileUploadAction`, `confirmFileUploadAction`
    (demographics-write + branch recheck), `downloadUrlAction`
    (demographics-read + branch recheck), `archiveFileAction`
    (demographics-write + branch recheck; AAL2 re-enforced inside the service).
    Each validates untrusted input with the existing `@/lib/files/schema`
    Zod schemas BEFORE authorization, maps `AuthorizationError` /
    `FileServiceError` to safe result codes (`FileActionFailure`), rethrows
    Next redirect errors (AAL2 step-up) instead of swallowing them, and never
    accepts org ids from the client; only the workflow actingBranchId is passed
    and re-verified via `requireBranchAccess`. No revalidatePath: mirrors the
    established `[patientId]/actions.ts` pattern where mutations return result
    objects and the client calls `router.refresh()`.
  - `files-section.tsx`: section styled exactly like sibling workspace
    sections; dense semantic table on desktop/tablet (`hidden md:block`) and a
    compact article list on phones (`md:hidden`); columns Type (mime) / Size
    (human-readable, "Not verified" while pending) / Uploaded (ISO date only,
    no locale-dependent formatting to avoid hydration drift) / Status.
    Download appears only for `available` rows (presigned URL is used via a
    transient detached anchor and never rendered into DOM); Archive appears
    for `available`+`pending` behind an AlertDialog confirmation naming the
    AAL2 requirement (BranchArchiveDialog pattern: preventDefault close-guard,
    deliberate close on success). All row/header controls are >=44px
    (`min-h-11`). Empty state and explicit load-failure alert included; no
    invented KPIs/cards/charts.
  - `upload-file-dialog.tsx`: controlled Dialog matching the workspace dialog
    composition; file input shows detected mime type ("Type: ..."), client-side
    oversize guard against MAX_FILE_SIZE_BYTES (UX only), then the exact flow:
    createFileUploadAction -> browser fetch PUT directly to MinIO presigned URL
    (Content-Type header set to match the SigV4 signature) ->
    confirmFileUploadAction -> router.refresh(). A generation ref makes close
    cancel-safe in EVERY phase (create/transfer/confirm); superseded closures
    bail silently and never setState or call confirm after close/reopen.
- Page integration: `[patientId]/page.tsx` server-renders the bounded list via
  `listPatientFiles({actingBranchId, patientId})` (RPC itself LIMIT 200)
  after its existing read-permission checks; expected failures degrade ONLY
  the Files section to an explicit alert while unexpected errors propagate to
  the error boundary like sibling sections.


- P4-07 adds server-only file services (`src/lib/files/`: Zod input/row schemas,
  safe error mapping incl. mechanical `STORAGE_*` codes, service wrappers) wiring
  the app to the Phase 4 file RPCs and the storage adapter. No UI, actions,
  routes, or new dependencies were added; all modules are `server-only`.
- P4-07 found and closed a real gap: the accepted P4-05 read RPCs returned no
  `object_key`, yet the plan and grant inventory both state presigning happens
  app-side after authorizing against `get_file_metadata`, and confirm/download/
  archive need the key server-side (patient/org ids are not derivable from a
  fileId). Fix is additive and precedented on the create_procedure hardening
  pattern: `20260826011000` recreates only `get_file_metadata(uuid,uuid)` adding
  `object_key` to its bounded projection (checksums still hidden), and
  `20260826011001` re-states the exact terminal EXECUTE grant, registered in
  `scripts/approved-final-grants.mjs`. The pgTAP projection assertions in
  `file_read_rpcs.test.sql` were updated to prove key exposure and that
  `list_patient_files` still excludes it.
- P4-07 extends the storage adapter minimally with `stat(key)` returning
  `{sizeBytes, contentType}` via S3 HeadObjectCommand (`READ_FAILED` mapping);
  unit tests cover success, missing content-length, and credential-safe errors.
- Confirm flow ordering is metadata gate → status must be pending → `stat` →
  verified-fact binding → `confirm_file_upload(uuid,uuid,integer,bigint)`. The
  service enforces `stat.sizeBytes <= MAX_FILE_SIZE_BYTES`, a positive size,
  and `stat.contentType === mime_type` (safe `INVALID_STATE` otherwise), then
  passes the HEAD-measured `p_verified_size_bytes`. Declared client sizes no
  longer participate in confirmation; any stat failure fails closed as
  `INVALID_STATE` (missing object vs outage are indistinguishable by design).
- Review fix closes the NULL-declared-size bypass: `20260826011100` recreates
  only `confirm_file_upload` with an additional required `bigint` parameter and
  persists that server-verified value into `size_bytes` on becoming available
  (authorization/locking/version/audit logic unchanged); it also adds the
  `file_objects_available_size_check` table CHECK so no row can be or become
  `available` with a null size, and revokes both old and new signatures
  adjacent to creation. Because the signature changed, `20260826011101`
  restates the terminal EXECUTE grant for the NEW signature following the exact
  create_procedure input-hardening precedent. The immutable
  `20260826010701` registration keeps its historical three-argument entry
  marked `supersededBy` the new signature: it still satisfies the per-file
  static lint while being excluded from the live-catalog final boundary
  (`browserReachableApprovedKeys`). pgTAP coverage proves verified-size
  persistence, CHECK rejection on both direct-insert and null-update paths,
  positive-size input validation, and stale-version rejection on the new
  signature.
- `checksum_sha256` deferral rationale: computing SHA-256 at confirm would
  require a full object read per confirmation, which is disproportionate for
  the upload path; checksum verification is deferred to deployment-readiness
  tooling alongside the R2 derivative work. The database now guarantees every
  available row carries a server-verified size, while checksums remain
  unverified/null until that tooling lands.
- Archive flow order is proven by tests: `requireAal2()` first, then metadata
  gate, then `archive_file`, then best-effort `storage.delete`; deletion failure
  never fails the archive and returns `{objectDeleted:false}`. Download refuses
  archived and pending rows before touching storage. A failed presign after
  `create_file_upload` intentionally leaves an orphaned pending row for later
  cleanup tooling. `CreateFileUploadResult` no longer exposes `objectKey`;
  `uploadUrl`, `expiresAt`, `fileId`, and `version` suffice for callers.
- Download auditing was NOT implemented: no app-side audit-writing mechanism
  exists in this repository (audit_events are written exclusively inside
  SECURITY DEFINER RPCs; grep of src/lib finds no audit writer). Per task rules
  no hack was added; download auditing needs either an RPC or an event mechanism
  and should be planned explicitly.
- Review-fix verification (2026-08-26, this checkpoint): the reviewer-reported
  typecheck failure (`delete row.object_key` TS2790) was replaced with a rest
  destructure and `npm run typecheck` now truly passes; `npm run lint` passes
  (0 errors). Fresh local reconstruction applied all 46 migrations plus
  synthetic seed; provisioning passed; `npm run test:db:local` passed all 22
  pgTAP suites and three concurrency probes. `npm run security:migrations`
  reports 46 files, 18 grant terminals, and 76 approved grants. Focused Vitest
  (`src/lib/files`, `src/lib/storage`) covers contentType mismatch, oversize
  stat, and verified-size RPC binding. Cloud TEST remains mandatory before
  production.
- Earlier P4-07 local verification: fresh local reconstruction applied all 44
  migrations plus synthetic seed; provisioning passed; `npm run test:db:local`
  passed all 22 pgTAP suites and three concurrency probes. `npm run lint`,
  `npm run typecheck`, `npm run security:migrations` (44 files, 17 terminals,
  75 approved grants), and full `npx vitest run` (50 files, 488 tests) passed.
- P3-00 is accepted. The independently reviewed Phase 3 plan is
  `docs/plans/003-provider-specialty-procedure-foundation.md`; ADR-021 extends
  the guarded, synthetic-only local verification boundary to its accepted
  checkpoints while preserving the mandatory Cloud TEST pre-production gate.
- P3-01 is independently reviewed and accepted on commits `46bb24b` and
  `1a52149`. It adds only `provider.read` and `provider.manage` to the stable
  permission catalog and grants them only to global OWNER and ADMIN roles.
  DENTIST, RECEPTIONIST, DENTAL_ASSISTANT, VISITING_SPECIALIST, and BILLING
  receive neither, so ADR-019's exact patient-only delegation exception is
  unchanged. No provider tables, RLS/RPC surfaces, browser grants, patient
  permissions, delegation functions, seeds, or hosted database writes were
  added.
- P3-01 registered `provider_permission_contract.test.sql` in the mandatory
  database-runner allowlist in the same checkpoint. A 16-suite local pgTAP run
  plus all three local concurrency suites passed after local reconstruction.
- P3-01 also fixed an existing verification blocker: the explicit ESLint global
  ignore set omitted the repository's git-ignored `.worktrees/` directory and
  full lint traversed nested dependency trees. The new minimal ignore is covered
  by a focused test; independent re-review ran `npm run lint` successfully.
- P3-02 is independently reviewed and accepted on commits `49f5867` and
  `5bde9a8`. It adds only provider, specialty, provider-branch, and
  provider-specialty tables, RLS, private predicates, synthetic fixtures, and
  registered pgTAP coverage. All browser/service-role table access remains
  denied. Composite FKs protect tenant-owned relations; the fixed-search-path
  specialty trigger allows global or same-tenant custom specialties only.
- The P3-02 review required and verified a `specialties.version` contract for
  the next checkpoint's optimistic writes, plus an exact partial-primary index
  proof. Fresh local reconstruction passed 17 pgTAP suites and three concurrency
  probes; `npm run verify` passed lint, typecheck, 372 unit tests, build, secret
  scan, migration lint, and dependency audit. Cloud TEST remains deferred and
  mandatory before production.
- P3-03 adds only the seven authenticated provider/specialty mutation RPCs and
  registered terminal grants. Each derives tenant context from an active acting
  branch, requires live organization-wide `provider.manage`, returns opaque
  IDs/versions, and writes exactly one `{}`-metadata
  `PROVIDER_CONFIGURATION` audit event atomically. Archive and linked-user
  mutations call `private.require_aal2()`.
- P3-03 pgTAP coverage proves exact RPC ACLs, empty SECURITY DEFINER search
  paths, owner positive flow, staff/anonymous/foreign denial, AAL1 denial for
  archive/linking, patch allowlisting, stale versions, duplicate/foreign
  relation rejection, immutable global specialties, and audit rollback.
- Fresh local reconstruction applied 28 migrations and synthetic seed;
  provisioning passed; `npm run test:db:local` passed all 17 pgTAP suites and
  three local concurrency probes. P3-04 is the next ordered task; no provider
  reads, application adapter, UI, procedure, scheduling, or public scope was
  added.
- P3-04 adds only three authenticated bounded reads: provider directory,
  provider configuration detail, and global-plus-own-tenant specialty catalog.
  Each derives tenant context from the active acting branch, requires `auth.uid()`
  and live organization-wide `provider.read`, uses an empty SECURITY DEFINER
  search path, and records no audit event. The directory excludes archived
  providers; no projection includes organization, membership, Auth, scheduling,
  patient, or calendar data.
- P3-04 adds server-only provider schemas, read adapters, safe error mapping,
  and wrappers for the P3-03 mutations. Inputs and RPC results are Zod-validated;
  mutation patches and association replacements reject arbitrary fields and
  duplicate IDs. The authenticated request client is used exclusively.
- The linked-project generated-type command remains unsuitable as local-preview
  evidence: it reproduced the documented hosted metadata omission and removed
  the patient contract. Its output was restored and is not part of this
  checkpoint. The new typed adapter contains a narrow local RPC boundary while
  validating all parameters/results; Cloud TEST type generation remains required
  before production.
- P3-05 adds only tenant-owned procedures, procedure-specialty requirements, and
  optional eligible-provider allow-lists, plus seven authenticated database RPCs
  and their terminal grants. Each RPC derives its organization from an active
  acting branch and rechecks the live organization-wide provider permission;
  mutations require provider.manage, reads require provider.read, and archive
  additionally requires AAL2. Association replacements lock/version the target,
  validate active same-tenant relations, and atomically write one `{}` metadata
  PROVIDER_CONFIGURATION audit event. No price, availability, scheduling, public
  projection, patient, clinical, or UI scope was added.
- P3-05 registers `procedure_foundation.test.sql` in the mandatory local/Cloud
  TEST suite list, adds deterministic synthetic procedure seed data, and records
  all seven exact authenticated-only RPC grants. The suite covers table shape and
  no-price contract, RLS/ACL denial, tenant FKs, global/own/foreign specialty
  behavior, duration/buffer/mode constraints, versioned mutation, AAL2 archive,
  bounded reads, and audit rollback atomicity.
- Fresh local reconstruction applied all 33 migrations and synthetic seed;
  provisioning and all 18 registered pgTAP suites plus three concurrency probes
  passed. `npm run security:migrations`, `npm run lint`, `npm run typecheck`,
  `npm run test:unit` (37 files, 386 tests), `npm run security:secrets`, and
  `npm run security:audit` passed. Cloud TEST remains mandatory before
  production; no hosted or production target was used.
- P3-05 is committed in `6d6abd6`, with its numeric-input correction in
  `53f0953`. P3-06 adds only server-only procedure schemas, typed bounded read
  adapters, mutation wrappers, safe error mapping, and focused unit coverage.
  Inputs and RPC rows are Zod-validated; form schemas normalize procedure codes
  to uppercase, reject price/untrusted fields, require acting branch context,
  enforce duration/buffer invariants and relation uniqueness, and permit only
  `REQUIRES_REVIEW` or `REQUEST_ONLY`. Archive calls `requireAal2()` before its
  RPC while the database retains the authoritative AAL2 gate.
- P3-06 corrected the migration-inventory expectations after the P3-05 numeric
  input-hardening migration. Full unit verification then passed with 39 files
  and 393 tests, alongside TypeScript, lint, and migration privilege lint.
- P3-07 adds only private `/providers` and `/settings/specialties` administration
  routes, loading state, Server Actions, responsive provider/specialty lists,
  and `provider.read` navigation entries. Both pages recheck live
  `provider.read`, derive a concrete active branch server-side, and use only the
  existing bounded provider/specialty adapters. Authorization failures render
  `PermissionDenied`; adapter failures render safe `PageError` content.
- Every mutation action validates untrusted `FormData`, binds the submitted
  acting branch to an immediate live `provider.manage` check before calling the
  service, and revalidates only affected private paths. Provider archive alone
  invokes `requireAal2`; no linked-user operation or UI control was added. The
  user explicitly deferred linked-user controls, so this checkpoint does not
  query Auth/member sources, exposes no link identifier to the browser, and
  does not call the reserved P3-03 linked-user capability.
- Provider UI is a semantic dense desktop/tablet table with a compact phone
  list, 44px action/form controls, editable identity/type/status/stored website
  profile fields, branch associations, and specialties. It contains no
  scheduling, availability, calendar, appointment, public-projection, price,
  or clinical controls. Global specialties are visibly read-only; only tenant
  custom specialties have mutation forms.
- P3-07 verification passed: `npm run test:unit` (42 files, 401 tests),
  `npm run test:db:local` (18 pgTAP suites and three local concurrency probes),
  `npm run lint`, `npm run typecheck`, `npm run security:migrations`,
  `npm run security:secrets`, `npm run security:audit` (0 vulnerabilities), and
  `git diff --check`. Next.js 16.3 installed guides for Server Actions, Route
  Handlers, and caching were read before implementation. Responsive Playwright
  coverage remains deferred because no guarded E2E target is configured.
- P3-08 adds only the private `/settings/procedures` administration route,
  loading state, Server Actions, responsive procedure catalog, and a
  `provider.read` navigation entry. The page requires live `provider.read`,
  chooses a server-authorized active branch, and uses only bounded procedure,
  provider, and specialty read adapters.
- Procedure actions validate untrusted `FormData` before rechecking live
  `provider.manage` against the submitted branch immediately before calling the
  existing procedure services. They accept only code, name, description,
  duration/buffers, status, website/online-booking flags, the two approved
  request modes, specialty requirement levels, and explicit eligible provider
  IDs. They do not invoke provider/specialty mutation services, accept tenant
  values, or expose price, auto-confirm, resource, availability, or public-link
  controls. Archive actions require AAL2 and all failures use one safe generic
  message.
- The catalog is a semantic dense table on desktop/tablet and a compact phone
  list. Forms use a single phone column and 44px controls. Archive requires an
  explicit native-dialog confirmation and returns focus to its trigger on
  cancellation or successful action.
- P3-08 application verification passed: focused procedure/navigation Vitest
  (3 files, 10 tests), `npm run test:unit` (45 files, 409 tests), `npm run
  lint`, `npm run typecheck`, `npm run security:migrations`, `npm run
  security:secrets`, `npm run security:audit` (0 vulnerabilities), and `git
  diff --check`. The required local reconstruction could not start because the
  separate `supabase_db_hjcmnmigvzufhvamlnmy` container already owns port 54322;
  it was not stopped or modified. No Cloud or production target was used.
- P3-09 local integration verification ran on 2026-08-26: `npm run
  security:migrations`, `npm run lint`, `npm run typecheck`, `npm run test:unit`
  (45 files, 409 tests), `npm run security:secrets`, `npm run security:audit`
  (0 vulnerabilities), `git diff --check`, and `npm run build` all passed.
  The build emitted the private `/providers`, `/settings/specialties`, and
  `/settings/procedures` routes as dynamic routes.
- A fresh P3-09 local reconstruction could not be run without disrupting the
  unrelated `supabase_db_hjcmnmigvzufhvamlnmy` project that owns port 54322. It
  was not stopped or modified. Earlier checkpoint reconstruction evidence covers
  P3-03 through P3-07; rerun the full local reconstruction once the port is
  available.
- Synthetic responsive Playwright/manual keyboard QA was not run because the
  guarded E2E environment is unavailable. Generated database types remain
  deferred: the linked hosted project omits existing patient contracts. Cloud
  TEST migration/type/RLS/authorization/E2E verification remains mandatory
  before production, and Phase 3 is not authorized for production provider or
  patient use.
- Do not create `docs/PHASE3_ACCEPTANCE_REVIEW.md` yet. The plan requires an
  independent review and explicit project-owner acceptance after the deferred
  verification evidence is complete.
- All four admin pages (providers, branches, specialties, procedures) now use a
  consistent modal dialog pattern: upper-right Add button opens a modal,
  row actions use labeled Edit (Pencil + text) and Archive buttons. No page
  renders an inline form below its list.
- ADR-022 established local MinIO as the S3-compatible object storage for
  development. Cloudflare R2 is deferred to deployment readiness. Storage
  configuration uses provider-neutral S3 environment variables.
- P2-04 through P2-11 are accepted by the project owner.
- The project owner amended ADR-020 on 2026-08-26: local verification is the
  Phase 2 checkpoint and P2-12 closeout gate. Guarded Cloud TEST is deferred to
  the mandatory pre-production gate.
- Local P2-12 reconstruction passed on commit `93a0dec`: start/reset, test
  tooling provisioning, all 15 pgTAP suites, and all three local concurrency
  suites. Lint, typecheck, and 370 unit tests also passed.
- Phase 2 was accepted by the project owner on 2026-08-26; see
  `docs/PHASE2_ACCEPTANCE_REVIEW.md`. Production remains blocked pending the
  deferred Cloud TEST gate and all other production security gates.

## P2-12 closeout status (2026-08-25)

- GitHub Actions Cloud TEST run
  `https://github.com/Ditherys/dental-emr/actions/runs/32859799644` ran against
  `dental-emr-test-02` (`plkjajlfnhsklmdloaut`) on commit `144664a`. Cloud target
  separation, migration preview/application, non-production pgTAP provisioning,
  synthetic seed load, and all 15 pgTAP suites passed. The application
  verification job also passed.
- The run stopped at `db:types:check:test`: `supabase gen types` omitted every
  patient table/function and the `audit_events.patient_id` field despite the
  same project passing the patient pgTAP suites. Locally regenerating types
  against the linked TEST project reproduced that omission. Do not commit that
  destructive generated output; it removes the patient type contract and fails
  the application typecheck. Investigate Supabase hosted schema/type metadata
  freshness, then rerun the guarded workflow. No DEV or production target may
  be used as a workaround.
- Commits `67d3b98` and `144664a` corrected the Cloud TEST diagnostic target
  and moved its transactional pgTAP runner from the inconsistent Supabase CLI
  JSON output path to `psql` using the protected canonical TEST database URI.
  The runner surfaces only sanitized stderr on failure.

- The project owner confirmed `dental-emr-test-02` (`plkjajlfnhsklmdloaut`) as
  the disposable Cloud TEST target. With ephemeral TEST-only metadata,
  `npm run ci:test-target` passed and `npx supabase link --project-ref
  plkjajlfnhsklmdloaut` completed. No migration, seed, query, or test command
  has run against it.
- The mandatory read-only `npx supabase migration list --linked` then stopped
  with `IPv6 is not supported on your current network`. Its proposed DEV relink
  command was not run. Restore IPv6 connectivity or use an approved TEST-only
  IPv4 database connection method, then prove the TEST project has no applied
  migrations before any guarded mutation.
- Safe environment inspection found all required Cloud TEST metadata absent:
  `APP_ENVIRONMENT`, `SUPABASE_PROJECT_ID`, `SUPABASE_TEST_PROJECT_ID`,
  `SUPABASE_DEV_PROJECT_ID`, `SUPABASE_PRODUCTION_PROJECT_ID`,
  `NEXT_PUBLIC_SUPABASE_URL`, `DATABASE_TEST_CONFIRMATION`,
  `E2E_TARGET_CONFIRMATION`, `APP_URL`, and `E2E_BASE_URL`. No values were
  printed or invented.
- `npm run ci:test-target` correctly refused before remote access with
  `APP_ENVIRONMENT is required for remote database tests.` The absent target
  blocks `db:push:dry`, `db:push:test`, `db:provision:test`, `db:seed:test`,
  `test:db`, `db:types:check:test`, `db:lint:test`, `security:auth`,
  `db:advisors:test`, and `test:e2e`. No CLI link, Cloud TEST, DEV, or production
  access occurred.
- Local closeout reconstruction passed: `npm run db:start:local`,
  `npm run db:reset:local` (24 migrations plus the synthetic seed),
  `npm run db:provision:local`, and `npm run test:db:local` (15 pgTAP suites and
  3 local concurrency suites). The local stack is synthetic-only.
- Application checks passed: `npm run security:migrations` (24 migrations,
  51 approved final privileges), `npm run lint`, `npm run typecheck`,
  `npm run test:unit` (35 files, 370 tests), `npm run security:secrets`, and
  `npm run security:audit` (0 vulnerabilities). `npm run build` passed using the
  existing CI development placeholders only; no TEST confirmation or
  migration-freeze value was set.
- P2-12 found and fixed a local-only logging issue: `db:start:local` forwarded
  Supabase CLI credential-bearing output. The wrapper now redacts database URLs
  and credential-table values before forwarding output; its focused 26-test suite
  and a redaction-verified local start/stop cycle passed.
- Before the Cloud TEST rerun, complete the remaining P2-12 E2E fixture work:
  the current E2E configuration provisions a receptionist under the legacy
  `E2E_BRANCH_USER_*` names and has no dedicated dentist identity/TOTP variables.
  P2-12 requires named synthetic receptionist and dentist fixtures, with a
  TEST-only dentist TOTP for the successful lifecycle flow. Do not add or set
  these credentials until the verified Cloud TEST target is available.
- Phase 2 is not accepted. The required Cloud TEST verification, hosted type
  check, Auth/advisor review, synthetic E2E/manual QA, independent security
  review, separate Phase 2 acceptance document, and human acceptance decision
  remain outstanding. Production remains blocked.

## P2-11 implementation summary

- Added the server-authorized `/patients/[patientId]` workspace with a persistent
  identity header and only the approved Overview, Demographics, Contacts, and
  Relationships sections. No clinical, scheduling, financial, files, timeline,
  alert, or placeholder-tab scope was added.
- The detail page verifies shared-patient read permission and a concrete active
  branch before calling the existing bounded `get_patient_detail` adapter, which
  remains the sole detail read/view-audit boundary. Missing, foreign, and denied
  targets share the same safe unavailable response.
- Added route-local Server Actions for demographics, child contact/relationship,
  archive/reactivate, and duplicate-candidate reads. Each validates input,
  independently rechecks live demographics-write permission and submitted branch,
  and invokes only existing service/RPC adapters. No direct patient-table query,
  organization ID, service role, or audit field is accepted.
- The responsive workspace preserves a pending demographics/contact edit for
  bounded duplicate review and sends an explicit confirmed retry only after staff
  approval. Stale, revoked, invalid-state, and generic failures use safe UI
  messages. Lifecycle is explicitly confirmed; the existing service and RPC retain
  the required AAL2 gate.
- Added focused Server Action authorization/input tests, a workspace component
  suite for bounded rendering, guardian flags, duplicate cancellation retention,
  stale recovery, and lifecycle confirmation, a synthetic E2E workspace
  create/open/edit journey, workspace loading state, and patient-list links to the
  opaque patient workspace route. The workspace prevents React's automatic form
  reset while duplicate candidates are reviewed, preserving the pending edit.
  Added `birthDate` and `status` to the existing `PatientDetail` TypeScript DTO to
  match the already validated detail RPC shape.

## P2-11 verification evidence

- `npm run lint`, `npm run typecheck`, and `npm run test:unit` passed: 35 files,
  369 tests.
- `npm run security:migrations`, `npm run security:secrets`,
  `npm run security:audit`, and `git diff --check` passed.
- `npm run build` was blocked as designed because no verified `APP_ENVIRONMENT`
  was supplied. `npm run test:e2e:list` was likewise blocked before discovery by
  the guarded hosted E2E environment. The synthetic P2-11 E2E is committed but
  was not run. No Cloud or production target was used.

## P2-11 review focus

- Verify direct Server Action invocation cannot use a forged/revoked branch or
  foreign patient/child ID, and the detail route produces no foreign payload or
  view audit.
- Verify duplicate cancel keeps edits, confirmation is the only override path,
  stale responses do not overwrite newer versions, and archive/reactivation stay
  AAL2-gated through the server service/RPC.
- Run the committed synthetic E2E only against the approved guarded TEST
  environment. Inspect keyboard focus return, dialogs, phone/tablet/desktop
  overflow, 44px controls, and the intentionally limited Phase 2 workspace.

## P2-10 implementation summary

- Added the permission-aware `/patients/new` registration route and a sectioned
  React Hook Form/Zod UI for identity, initial mobile/email, and address data.
  It uses the selected active branch as workflow context, falls back from `All
  Branches` to an authorized active branch, and keeps touch targets at least 44px
  on phone layouts while using semantic two/three-column field groups at larger
  widths.
- The creation Server Action validates all untrusted input, rechecks live shared
  demographics-write permission and the submitted branch, and uses only the
  existing patient service/RPC adapters. It accepts no organization, patient
  number, actor, role, or audit fields.
- An unconfirmed `create_patient` duplicate response is followed by the existing
  bounded duplicate-read RPC only to render the authorized comparison projection.
  No patient is created until the staff member explicitly confirms. Cancelling
  returns to the form with its values preserved; confirmation resubmits through
  the authoritative create RPC with `duplicateConfirmed: true`.
- Added a registration action from the authorized directory and component/unit
  coverage for validation, pending/duplicate review, cancellation, confirmation,
  input validation, and revoked branch/role handling. Extended the synthetic
  Playwright journey to create a patient, cancel duplicate review, and confirm a
  legitimate distinct record.
- No migration, database schema, RPC, generated type, direct patient-table query,
  service-role grant, clinical, detail/edit workspace, contact/relationship edit,
  or lifecycle UI was added. P2-11 remains out of scope.

## P2-10 verification evidence

- `npm run lint`, `npm run typecheck`, and `npm run test:unit` passed: 33 files,
  363 tests.
- `npm run security:migrations`, `npm run security:secrets`,
  `npm run security:audit`, and `git diff --check` passed.
- No local database run was required: P2-10 changes no schema, RPC, seed, or
  database test. No Cloud or production target was used.
- `npm run build` was blocked as designed because this workspace has no verified
  `APP_ENVIRONMENT`. `npm run test:e2e:list` was likewise blocked before test
  discovery because the guarded hosted E2E environment is absent. The synthetic
  E2E flow is committed but not run.

## P2-10 review focus

- Verify direct Server Action invocation cannot use a forged or revoked branch,
  and that the duplicate candidate projection remains bounded and permission
  checked after the create RPC returns a duplicate warning.
- Verify duplicate cancellation preserves values and explicit confirmation is the
  only route to a duplicate override; run the synthetic E2E workflow only against
  the approved guarded TEST environment.
- Inspect phone/tablet/desktop field layout, dialog focus return, keyboard
  interaction, no-overflow behavior, and accessible error associations. Production
  remains out of scope.

## P2-09 implementation summary

- Added the permission-aware `/patients` route, loading state, and responsive
  patient list. Desktop/tablet presents the bounded projection in a semantic
  table; phone presents the same required information as a compact, touch-safe
  list. No create route, patient detail/workspace, mutation UI, dashboard data,
  preview drawer, bulk action, export, clinical, scheduling, or other P2-10+
  scope was added.
- The list starts from a server-authorized, concrete active branch and uses only
  the existing `search_patients` read-RPC adapter. Client search/filter/sort/page
  changes call a narrow server action that validates its input, rechecks shared
  patient-read permission and the submitted branch, and lets the existing RPC
  independently enforce live exact patient permission. It never accepts an
  organization ID and does not put patient search values in URLs.
- Archive status is offered only to actors with live demographics-write
  permission; the server action independently rechecks that permission. The
  selected branch remains workflow/audit context and does not filter the shared
  organization directory.
- Added the Patients navigation item. The EMR shell uses the named shared-patient
  permission predicate rather than generic organization-wide navigation logic,
  so active branch-scoped dentists/receptionists see the link while owners and
  other denied roles do not. Direct route access still reauthorizes.
- Added unit/component coverage for navigation, server authorization/input
  checks, search debounce, paging, empty/authorization-error states, and compact
  mobile rendering. Added Playwright authorized/direct-URL-denial journeys using
  the existing synthetic receptionist and owner identities.

## P2-09 verification evidence

- `npm run lint`, `npm run typecheck`, and `npm run test:unit` passed: 31 files,
  357 tests.
- `npm run security:migrations`, `npm run security:secrets`,
  `npm run security:audit`, and `git diff --check` passed.
- `npm run build` was not runnable because this workspace has no
  `APP_ENVIRONMENT`, and Next config deliberately rejects an unverified target.
  `npm run test:e2e:list` likewise refused before discovery because the guarded
  hosted E2E environment is absent. No environment was supplied and no cloud or
  production target was used.
- P2-09 changes no migrations or database contracts, so no local database reset
  was required for this UI-only checkpoint.

## P2-09 review focus

- Verify the server action cannot use a forged branch to bypass the existing
  shared-directory authorization, including after a role or branch revocation.
- Verify the navigation's shared-patient predicate preserves the intended
  branch-scoped receptionist/dentist semantics while owner/admin remain denied.
- Run the added synthetic Playwright flows only in the approved guarded TEST
  environment; inspect phone/tablet/desktop overflow, focus, labels, and target
  sizes during that review. Production remains out of scope.

## P2-06 implementation summary

- Added `20260825010500_patient_demographics_write.sql` and registered terminal
  grant `20260825010600_patient_demographics_write_grants.sql`. The only new
  browser-reachable surface is authenticated `update_patient`; `service_role` and
  patient base tables remain denied.
- The SECURITY DEFINER RPC derives actor from `auth.uid()` and tenant from the
  trusted acting branch/target row, rechecks live patient-write permission, and
  returns the same safe denial for foreign or missing targets.
- The PATCH permits only mutable demographics, preserves omitted values, requires
  the expected version, locks duplicate state plus the target row, and increments
  version atomically. Name/DOB changes recheck duplicates under the shared lock.
- Preferred branch is tri-state: omitted preserves even an inaccessible existing
  preference, null clears, and a UUID requires an active accessible branch.
- Each successful update emits one opaque patient-linked audit event atomically;
  audit insertion failure rolls back the patient update.
- Added validated server-only service/schema/types, stale-version error mapping,
  generated RPC declaration, pgTAP coverage, and local two-client race coverage.

## Verification evidence

- Fresh local Supabase start/reset applied all 20 migrations and synthetic seed.
- Local non-production pgTAP provisioning passed.
- `npm run test:db:local` passed all 13 registered SQL suites and both local
  concurrency suites, including `patient_demographics_write.test.sql`.
- `npm run test:unit` passed: 29 files, 343 tests.
- `npm run lint`, `npm run typecheck`, `npm run security:migrations`,
  `npm run security:secrets`, and `npm run security:audit` passed.
- No Cloud TEST target, production credential, or real data was used.

## P2-08 implementation summary

- Added `20260825010900_patient_lifecycle.sql` and its registered terminal grant
  `20260825011000_patient_lifecycle_grants.sql`. The only new browser-reachable
  surfaces are authenticated `archive_patient` and `reactivate_patient`; patient
  base tables and `service_role` remain denied.
- Both `SECURITY DEFINER` RPCs call `private.require_aal2()`, derive organization
  from an active acting branch, recheck live demographics-write permission, lock
  the tenant-scoped patient row, and reject stale versions and no-op transitions.
  They accept no actor, organization, status, audit, or archive timestamp input.
- Archive sets `status = archived` with an archive timestamp; reactivate restores
  `status = active` with a null archive timestamp. Each successful transition
  emits exactly one opaque patient-linked audit event in the same transaction.
  Failed audit insertion rolls back the transition.
- Replaced `search_patients` through the same fail-closed terminal sequence so
  default searches exclude archived patients while the authorized explicit
  `archived` status filter remains available.
- Added the server-only lifecycle schema/service/types/RPC declarations. The
  service independently calls `requireAal2()` before the RPC; safe error mapping
  now includes `INVALID_STATE`.

## P2-08 verification evidence

- Fresh local start/reset applied all 24 migrations and the synthetic seed; local
  non-production pgTAP provisioning passed.
- `npm run test:db:local` passed all 15 registered SQL suites and all 3 local
  concurrency suites, including `patient_lifecycle.test.sql`.
- `npm run test:unit` passed: 29 files, 347 tests. `npm run lint`,
  `npm run typecheck`, `npm run security:migrations`, `npm run security:secrets`,
  `npm run security:audit`, and `git diff --check` passed.
- No Cloud TEST target, production credential, or real data was used.

## P2-08 review focus

- Verify the P2-08 `CREATE OR REPLACE search_patients` pre-revoke/revoke/terminal
  grant sequence and default active-only status behavior.
- Verify lifecycle errors do not distinguish foreign/missing patients, AAL1 is
  denied in the database and server service, and no direct patient DML grant was
  introduced.
- This checkpoint adds no UI, dialogs, P2-09 navigation/list screen, hard delete,
  merge, retention erasure, clinical, scheduling, financial, or export scope.

## Self-review focus

- No direct patient-table query or privilege was added to the application path.
- Tenant identity, patient number, creator, actor, audit action, status, and version
  cannot be mass-assigned through the PATCH document.
- Audit metadata uses the existing empty default only; no changed patient value is
  inserted into an audit row or returned error.
- P2-06 intentionally adds no UI, contact/relationship mutation, lifecycle,
  provider, scheduling, clinical, financial, or export scope.

## P2-07 implementation summary

- Added `20260825010700_patient_children_write.sql` and registered terminal
  grant `20260825010800_patient_children_write_grants.sql`. The only new
  browser-reachable surfaces are six authenticated contact/relationship create,
  update, and archive RPCs; patient child base tables and `service_role` remain
  denied.
- Each RPC derives organization from an active acting branch, rechecks live
  demographics-write permission, locks and derives the parent patient, rejects
  archived parents/children, and never accepts child tenant movement.
- Mobile/email mutations use the shared organization duplicate advisory lock,
  authoritative canonical normalization, recheck active contacts owned by other
  patients, and require explicit confirmation for an actual duplicate. Primary
  contact demotion/promotion serializes through the parent contact set and its
  partial unique index.
- All child mutations use optimistic versions and atomically append one opaque,
  patient-linked audit event. Relationship patient targets are tenant-safe and
  self/foreign links fail with stable safe errors.
- Added server-only Zod schemas/service adapters/types/RPC declarations, focused
  pgTAP coverage, the P2-07 local two-client contact duplicate race, and updated
  the exact grant inventory and database test runner.

## P2-07 verification evidence

- Fresh local start/reset applied all 22 migrations and synthetic seed; local
  non-production pgTAP provisioning passed.
- `npm run test:db:local` passed all 14 registered SQL suites and all 3 local
  concurrency suites, including `patient_children_write.test.sql` and the new
  contact-update race.
- `npm run test:unit` passed: 29 files, 345 tests. `npm run lint`,
  `npm run typecheck`, and `npm run security:migrations` passed.
- No Cloud TEST target, production credential, or real data was used.
