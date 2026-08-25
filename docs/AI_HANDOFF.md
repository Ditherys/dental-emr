# AI Handoff - P2-12 local closeout

> Rolling handoff between coding agents. The repository, approved plans,
> migrations, tests, ADRs, and Git history remain authoritative.

## Current checkpoint

- P2-04 through P2-11 are accepted by the project owner.
- The project owner amended ADR-020 on 2026-08-26: local verification is the
  Phase 2 checkpoint and P2-12 closeout gate. Guarded Cloud TEST is deferred to
  the mandatory pre-production gate.
- Local P2-12 reconstruction passed on commit `93a0dec`: start/reset, test
  tooling provisioning, all 15 pgTAP suites, and all three local concurrency
  suites. Lint, typecheck, and 370 unit tests also passed.
- Phase 2 still requires independent closeout review, recorded manual QA, and
  separate project-owner acceptance. Production remains blocked pending the
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
