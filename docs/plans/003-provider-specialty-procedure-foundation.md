# Phase 3 — Provider, Specialty & Procedure Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Proposed — requires independent review and explicit project-owner
approval before any `P3-*` implementation task begins.

**Goal:** Deliver an internal, organization-safe provider, specialty, and
procedure configuration foundation for later scheduling and website phases.

**Architecture:** Provider and procedure configuration is tenant-owned and
accessed through narrowly granted, server-authorized PostgreSQL RPCs. New public
tables fail closed at creation, use RLS and tenant-aware foreign keys, and are
never exposed as a public-website projection. Next.js Server Components and
Server Actions recheck the live `provider.read` or `provider.manage` permission
before calling server-only adapters; the database repeats the authorization and
writes an opaque audit event in the same transaction.

**Tech Stack:** Next.js App Router, React, TypeScript strict, Zod, React Hook
Form, Tailwind CSS, shadcn/ui, Lucide, Supabase/PostgreSQL, pgTAP, Vitest,
Testing Library, Playwright.

## Global Constraints

- Organization is the tenant boundary; branch is operational context only.
- Do not trust browser-supplied organization, actor, role, permission, audit,
  or authorization data.
- All exposed tenant tables require RLS. Base-table DML is never granted to
  browser roles; new `SECURITY DEFINER` functions begin with default execution
  revoked and end with exact registered grants only.
- Every provider/procedure relation uses a tenant-aware composite foreign key or
  a trigger that proves the equivalent invariant. A cross-tenant association
  must fail at the database layer.
- `provider_type` never means available, bookable, public, clinical-authorized,
  or linked to a user account. No availability, appointments, resources,
  calendar, conflict, public route/API, price, quote guidance, billing, patient,
  or referral scope is allowed.
- Website fields are persisted only. All public provider/procedure projection
  and public booking behavior remains deferred.
- Booking modes in this phase are exactly `REQUIRES_REVIEW` and `REQUEST_ONLY`;
  `AUTO_CONFIRM` is prohibited until scheduling transactions exist.
- Use deterministic synthetic fixtures only. Do not log or store provider
  contact/profile text in audit metadata, errors, screenshots, or test output.
- Work in the current checkout on `main`, as explicitly requested. Do not
  create a worktree or branch.
- Before any Next.js implementation, read the relevant installed guide under
  `node_modules/next/dist/docs/` and follow its current conventions.
- Every database checkpoint runs the local guarded reconstruction path from
  ADR-020. Cloud TEST remains mandatory before production, never as an
  ambiguous/unguarded target.

## File Structure

| Path | Responsibility |
|---|---|
| `supabase/migrations/20260826010000_provider_permission_contract.sql` | Add provider permissions and exact system-role grants without changing patient-role delegation semantics. |
| `supabase/migrations/20260826010100_provider_foundation.sql` | Provider, specialty, provider-branch, and provider-specialty schema, constraints, RLS, private helpers, and no grants. |
| `supabase/migrations/20260826010200_provider_mutations.sql` | Provider/specialty mutation RPCs and no grants. |
| `supabase/migrations/20260826010201_provider_mutations_grants.sql` | Exact mutation RPC grants and registered final privilege boundary. |
| `supabase/migrations/20260826010300_provider_reads.sql` | Provider/specialty read RPCs and no grants. |
| `supabase/migrations/20260826010301_provider_reads_grants.sql` | Exact provider read RPC grants and final privilege boundary. |
| `supabase/migrations/20260826010400_procedure_foundation.sql` | Procedure and qualification schema, constraints, RLS, private helpers, and no grants. |
| `supabase/migrations/20260826010500_procedure_rpcs.sql` | Procedure/qualification read and mutation RPCs and no grants. |
| `supabase/migrations/20260826010501_procedure_rpcs_grants.sql` | Exact procedure RPC grants and final privilege boundary. |
| `supabase/tests/provider_permission_contract.test.sql` | Permission catalog, role matrix, and owner/admin vs staff negative authorization tests. |
| `supabase/tests/provider_foundation.test.sql` | Provider/specialty schema, RLS, grant, tenant, audit, and mutation tests. |
| `supabase/tests/procedure_foundation.test.sql` | Procedure/qualification schema, RLS, grant, tenant, audit, and mutation tests. |
| `supabase/seed.sql` | Idempotent synthetic specialties/providers/procedures used only by local and Cloud TEST fixtures. |
| `scripts/approved-final-grants.mjs` | Exact Phase 3 RPC signatures and caller-role allowlist. |
| `src/lib/providers/*` | Server-only schemas, DTO validation, typed RPC adapter, error mapping, and service functions. |
| `src/app/(emr)/providers/*` | Permission-checked internal provider management route and actions. |
| `src/app/(emr)/settings/specialties/*` | Permission-checked specialty management route and actions. |
| `src/app/(emr)/settings/procedures/*` | Permission-checked procedure management route and actions. |
| `src/components/layout/navigation-items.ts` | Provider/configuration navigation declared with explicit permission gates. |
| `src/types/database.generated.ts` | Generated local-preview contract, followed by mandatory Cloud TEST generated-type check before production. |
| `docs/AI_HANDOFF.md` | Exact checkpoint, verification, risks, and next approved task only after each accepted task. |

## Ordered Checkpoints

### P3-00 — Plan review and authorization

**Precondition:** Phase 2 acceptance is recorded in
`docs/PHASE2_ACCEPTANCE_REVIEW.md`.

**Scope:** Independently review this plan, the Phase 3 design specification,
the architecture/security/database sections named in the design, and the
existing privilege model. Record an explicit project-owner acceptance before
editing application or migration files.

**Acceptance criteria:**

- [ ] The reviewer confirms this plan excludes scheduling, resources, public
  projections, availability, prices, and clinical scope.
- [ ] The reviewer confirms `provider.read`/`provider.manage` roles and audit
  actions are least-privilege and compatible with Phase 2's owner/patient
  separation.
- [ ] The project owner explicitly approves the ordered `P3-01` through
  `P3-09` checkpoints.

### P3-01 — Provider permission contract

**Files:**

- Create: `supabase/migrations/20260826010000_provider_permission_contract.sql`
- Create: `supabase/tests/provider_permission_contract.test.sql`
- Modify: `src/lib/authorization/policy.ts`
- Modify: `src/lib/authorization/policy.test.ts`
- Modify: `scripts/approved-final-grants.mjs` only if an existing function ACL
  is affected; otherwise do not add a grant entry in this task.

**Interfaces:**

- Produces `PermissionCode` members `provider.read` and `provider.manage`.
- Produces an immutable catalog contract: OWNER and ADMIN receive both provider
  permissions organization-wide; DENTIST, RECEPTIONIST, DENTAL_ASSISTANT,
  VISITING_SPECIALIST, and BILLING receive neither in Phase 3.

- [ ] Write pgTAP assertions that the two permission rows exist exactly once,
  OWNER and ADMIN receive both, and every other baseline role receives neither.
- [ ] Run the new suite before the migration; expected result: it fails because
  the permission rows do not exist.
- [ ] Add the two permission rows with stable descriptions and idempotent
  `on conflict (code) do nothing` behavior. Add only the two exact role grants;
  do not change membership, branch, patient, or delegation functions.
- [ ] Extend `foundationPermissionCodes` and unit tests so unknown provider
  permission strings are rejected by TypeScript/authorization policy callers.
- [ ] Run `npm run db:start:local`, `npm run db:reset:local`,
  `npm run db:provision:local`, and `npm run test:db:local`; expected result:
  every existing suite plus `provider_permission_contract.test.sql` passes.
- [ ] Run `npm run lint`, `npm run typecheck`, and `npm run test:unit`; expected
  result: all pass.
- [ ] Independently review role escalation and Phase 2 delegation effects, then
  commit only this checkpoint with message `feat: add provider permissions`.

### P3-02 — Provider, specialty, and association schema

**Files:**

- Create: `supabase/migrations/20260826010100_provider_foundation.sql`
- Create: `supabase/tests/provider_foundation.test.sql`
- Modify: `supabase/seed.sql`

**Interfaces:**

- Produces tables `providers`, `specialties`, `provider_branches`, and
  `provider_specialties` plus composite tenant keys.
- Produces private predicates `private.can_read_provider_configuration(uuid)`
  and `private.can_manage_provider_configuration(uuid)` that bind the actor to
  `auth.uid()` and require active membership plus the exact organization-wide
  provider permission.

- [ ] Write pgTAP tests first for table/column shape, RLS enabled, revocation
  of `PUBLIC`, `anon`, `authenticated`, and `service_role` table privileges,
  composite FK rejection for Org A/Org B associations, and no direct DML.
- [ ] Write failing constraint tests for unsupported provider type, a linked
  user who is not an active same-organization member, duplicate provider-branch
  relations, foreign custom specialty assignment, and two primary specialties.
- [ ] Create `providers` with organization ID, optional linked user ID, bounded
  name/title/license/contact fields, constrained type/status, stored-only
  `website_visible`/`bio`, timestamps, archive state, `(organization_id,id)`
  uniqueness, tenant/status indexes, and `updated_at` trigger. Use a composite
  FK to `organization_members(organization_id,user_id)` for linked users, or
  an equivalent trigger that also rejects inactive membership.
- [ ] Create `specialties` with nullable organization ID for global defaults,
  tenant-owned custom rows, code/name/active state, scope-sensitive uniqueness,
  and an immutability guard that prevents tenant mutation/deletion of global
  rows. Seed only the approved synthetic global examples: GENERAL_DENTISTRY,
  ORTHODONTICS, PERIODONTICS, PROSTHODONTICS, ENDODONTICS, ORAL_SURGERY, and
  PEDIATRIC_DENTISTRY.
- [ ] Create `provider_branches` and `provider_specialties` with direct
  organization ID, composite foreign keys to parent provider/branch/specialty
  records, active state where required, and a partial unique index allowing at
  most one primary specialty for each provider.
- [ ] Add RLS policies only for bounded configuration reads through approved
  RPC paths; do not grant base-table SELECT. Create private helpers with a fixed
  empty search path and revoke execution immediately after definition.
- [ ] Add idempotent synthetic Provider A/Provider B fixture rows to `seed.sql`
  without phone, email, bio, or real-person content. Extend the seed-security
  suite to prove fixture text has no secret or real-data pattern.
- [ ] Run the complete local reconstruction/database suite and app checks from
  P3-01. Commit as `feat: add provider foundation schema` after independent
  RLS/FK/grant review.

### P3-03 — Provider and specialty RPC mutations

**Files:**

- Create: `supabase/migrations/20260826010200_provider_mutations.sql`
- Create: `supabase/migrations/20260826010201_provider_mutations_grants.sql`
- Modify: `supabase/tests/provider_foundation.test.sql`
- Modify: `scripts/approved-final-grants.mjs`

**Interfaces:**

- Produces authenticated RPCs `create_provider`, `update_provider`,
  `archive_provider`, `create_specialty`, `update_specialty`,
  `set_provider_branches`, and `set_provider_specialties`.
- Each mutator accepts a target/acting branch UUID only as workflow context,
  derives organization and actor from trusted state, returns opaque IDs/version,
  and writes one sanitized audit event on success.

- [ ] Write failing pgTAP tests for AAL1/AAL2 requirements chosen by the review:
  normal catalog edits require live `provider.manage`; archive and linked-user
  changes additionally require `private.require_aal2()` because they alter
  workforce-adjacent configuration. Test revoked role/membership, forged branch,
  foreign target, stale version, failed audit insertion, and no side effect on
  every denial.
- [ ] Implement versioned provider/specialty mutation RPCs. Accept only field
  values declared in the plan; never accept `organization_id`, `actor_user_id`,
  audit values, role, permission, or arbitrary JSON patches. Lock the tenant
  target row and use `expected_version` for updates/archive.
- [ ] Implement association replacement inside one transaction: lock the
  provider, validate every submitted branch/specialty belongs to the provider
  organization and is active, reject duplicate IDs, enforce at most one primary
  specialty, then replace the bounded relation set atomically.
- [ ] Use only `{}` audit metadata with actions `provider.created`,
  `provider.updated`, `provider.archived`, `specialty.created`,
  `specialty.updated`, `provider.branches.updated`, and
  `provider.specialties.updated`; set the entity ID but never insert names,
  license/contact/profile values, or submitted IDs into metadata.
- [ ] Open the new additive object migration with contiguous `REVOKE ALL` statements for
  every new public RPC before creating/replacing functions. In the terminal
  grants migration grant EXECUTE only to `authenticated`, register every exact
  signature/reason in `approved-final-grants.mjs`, and retain service-role denial.
- [ ] Extend pgTAP with exact function ACL, safe search path, audit atomicity,
  and owner/admin positive plus staff/foreign/anon/service-role negative cases.
- [ ] Run migration lint, full local database suite, lint, typecheck, unit
  tests, secrets scan, and dependency audit. Commit as
  `feat: add provider configuration mutations` after independent security
  review.

### P3-04 — Provider and specialty bounded reads/server adapter

**Files:**

- Create: `src/lib/providers/schema.ts`
- Create: `src/lib/providers/types.ts`
- Create: `src/lib/providers/errors.ts`
- Create: `src/lib/providers/data.ts`
- Create: `src/lib/providers/service.ts`
- Create: `src/lib/providers/schema.test.ts`
- Create: `src/lib/providers/service.test.ts`
- Create: `supabase/migrations/20260826010300_provider_reads.sql`
- Create: `supabase/migrations/20260826010301_provider_reads_grants.sql`
- Modify: `supabase/tests/provider_foundation.test.sql`
- Modify: `src/types/database.generated.ts`

**Interfaces:**

- Produces authenticated read RPCs `list_provider_directory`,
  `get_provider_configuration`, and `list_specialties` returning bounded DTOs.
- Produces server-only `listProviders()`, `getProvider(id)`, `listSpecialties()`,
  and mutation wrappers that parse Zod inputs/results before use.

- [ ] Write tests that each Zod input rejects non-UUID IDs, overlong profile
  text, invalid provider/status/booking values, invalid durations, duplicate
  relation IDs, and untrusted organization/actor/audit keys.
- [ ] Write pgTAP tests proving read RPCs require live `provider.read`, return
  no cross-tenant records, exclude archived providers by default, return no
  auth/member internals, and leave no audit event for list reads.
- [ ] Create the additive provider-read migration with contiguous `REVOKE ALL`
  statements before each `SECURITY DEFINER` read RPC definition, a fixed empty
  search path, tenant authorization derived from `auth.uid()`, and no table
  grant. Create the paired terminal grants migration that grants only the exact
  read signatures to `authenticated`, revokes every signature from
  `service_role`, and registers each signature/reason in
  `approved-final-grants.mjs`.
- [ ] Implement bounded read RPC projections. Provider list rows contain opaque
  ID, display name, type, active status, website-visible flag, primary
  specialty label, and branch count only; detail adds the stored editable
  fields and selected association IDs. No raw Auth data, schedules, patient
  data, calendar data, or public endpoint is returned.
- [ ] Implement server-only adapters using the authenticated request client and
  explicit error mapping (`NOT_AUTHORIZED`, `NOT_FOUND_OR_DENIED`, `STALE`,
  `INVALID_INPUT`, `INVALID_STATE`, `FAILED`). All foreign/not-found errors use
  the same safe application message.
- [ ] Generate a local-preview database type contract after local reset and
  verify the exact RPC/table declarations. Before production, rerun the
  Cloud TEST generated-type check mandated by ADR-020; do not treat local types
  as hosted evidence.
- [ ] Run focused Vitest, pgTAP, TypeScript, and lint checks; commit as
  `feat: add provider configuration services` after reviewer validates the
  projection boundary.

### P3-05 — Procedure and qualification schema/RPCs

**Files:**

- Create: `supabase/migrations/20260826010400_procedure_foundation.sql`
- Create: `supabase/migrations/20260826010500_procedure_rpcs.sql`
- Create: `supabase/migrations/20260826010501_procedure_rpcs_grants.sql`
- Create: `supabase/tests/procedure_foundation.test.sql`
- Modify: `supabase/seed.sql`
- Modify: `scripts/approved-final-grants.mjs`

**Interfaces:**

- Produces `procedures`, `procedure_specialties`, and
  `procedure_eligible_providers` tables.
- Produces `create_procedure`, `update_procedure`, `archive_procedure`,
  `set_procedure_specialties`, `set_procedure_eligible_providers`,
  `list_procedures`, and `get_procedure_configuration` authenticated RPCs.

- [ ] Write failing pgTAP tests for RLS, no direct DML, exact ACLs, tenant FKs,
  code uniqueness per organization, valid duration/buffer ranges, allowed
  modes, active/archive state, and absence of price columns.
- [ ] Create `procedures` with organization ID, code, name, optional bounded
  description, nullable positive default duration, non-negative pre/post
  buffers, active/archive state, stored-only website visibility and online
  booking flags, booking mode defaulting to `REQUIRES_REVIEW`, timestamps,
  version, `(organization_id,id)` uniqueness, and tenant/status/name indexes.
  Add a check that a null duration has zero buffers.
- [ ] Create `procedure_specialties` with `REQUIRED`/`PREFERRED` requirement
  level, and `procedure_eligible_providers` as an optional allow-list. Both
  have organization ID plus composite FKs that reject foreign specialties or
  providers, unique relation constraints, and no availability semantics.
- [ ] Implement versioned, audit-atomic mutators using the same live provider
  manage predicate. Association replacements lock the procedure, validate each
  related record is active/same-tenant, reject duplicates, and commit all rows
  or none. Use actions `procedure.created`, `procedure.updated`,
  `procedure.archived`, `procedure.specialties.updated`, and
  `procedure.eligible_providers.updated` with `{}` metadata only.
- [ ] Implement bounded list/detail read RPC projections requiring
  `provider.read`. A list row includes opaque ID, code, name, active state,
  duration/buffers, website/booking flags, booking mode, and counts; detail
  includes editable description and selected requirement/eligible IDs only.
- [ ] Apply the same revoke-first/grant-last migration sequence, registered
  ACL allowlist, safe search paths, anonymous/service-role denial, and negative
  pgTAP coverage used in P3-03.
- [ ] Run full local reconstruction and application verification. Commit as
  `feat: add procedure qualification foundation` after independent database and
  authorization review.

### P3-06 — Procedure server adapter and validation

**Files:**

- Create: `src/lib/procedures/schema.ts`
- Create: `src/lib/procedures/types.ts`
- Create: `src/lib/procedures/errors.ts`
- Create: `src/lib/procedures/data.ts`
- Create: `src/lib/procedures/service.ts`
- Create: `src/lib/procedures/schema.test.ts`
- Create: `src/lib/procedures/service.test.ts`
- Modify: `src/types/database.generated.ts`

**Interfaces:**

- Produces typed `listProcedures()`, `getProcedure(id)`, and procedure mutation
  service functions that only consume validated domain inputs.

- [ ] Write failing unit tests for code normalization, required names, bounded
  description, positive duration, zero-or-positive buffers, two permitted
  booking modes, boolean flags, unique specialty/provider IDs, and no price
  property accepted by the form schema.
- [ ] Implement Zod schemas and server-only RPC wrappers mirroring the P3-05
  function signatures. Parse every returned row, map safe errors without
  embedding user input, and make an empty allow-list distinct from an omitted
  update only where the RPC explicitly supports that intent.
- [ ] Test each RPC wrapper for correct parameter mapping and safe mapping of
  permission/stale/invalid-state/unknown failures.
- [ ] Run focused unit/type/lint checks and commit as
  `feat: add procedure configuration services`.

### P3-07 — Internal provider and specialty administration UI

**Files:**

- Create: `src/app/(emr)/providers/page.tsx`
- Create: `src/app/(emr)/providers/loading.tsx`
- Create: `src/app/(emr)/providers/actions.ts`
- Create: `src/app/(emr)/providers/provider-directory.tsx`
- Create: `src/app/(emr)/providers/provider-form.tsx`
- Create: `src/app/(emr)/providers/provider-directory.test.tsx`
- Create: `src/app/(emr)/providers/actions.test.ts`
- Create: `src/app/(emr)/settings/specialties/page.tsx`
- Create: `src/app/(emr)/settings/specialties/actions.ts`
- Create: `src/app/(emr)/settings/specialties/specialty-list.tsx`
- Create: `src/app/(emr)/settings/specialties/specialty-form.tsx`
- Create: `src/app/(emr)/settings/specialties/actions.test.ts`
- Modify: `src/components/layout/navigation-items.ts`
- Modify: `src/components/layout/navigation-items.test.ts`

**Interfaces:**

- Consumes P3-04 server-only provider/specialty services.
- Produces private `/providers` and `/settings/specialties` routes, both
  guarded by `provider.read`; create/edit/archive controls require a current
  `provider.manage` authorization on the server action.

- [ ] Read the installed Next.js documentation applicable to Server Actions,
  route conventions, and caching before writing UI code.
- [ ] Write action tests first for forged/foreign provider and branch IDs,
  revoked permissions after page load, invalid FormData, AAL2 archive/link-user
  enforcement, and safe generic error messages.
- [ ] Implement server pages that call `requirePermission({ permission:
  "provider.read" })`, render `PermissionDenied` for authorization failures,
  render `PageError` for safe operational failures, and never put organization
  IDs or profile data in URLs.
- [ ] Implement server actions that parse `FormData` with P3 schemas, call
  `requirePermission({ permission: "provider.manage" })` immediately before
  service invocation, require AAL2 only for archive/link-user mutations, and
  revalidate only the affected private paths after success.
- [ ] Implement dense semantic table plus compact phone list layouts. Provider
  form fields are identity/type/status/website profile, branch associations,
  and specialties; no availability/calendar/appointment controls appear.
  Specialty UI distinguishes global read-only entries from mutable tenant
  custom entries.
- [ ] Add navigation entries only where users have live provider permissions;
  direct routes remain server-authorized. Verify 44px controls, keyboard dialog
  operation/focus return, labels, inline errors, and no horizontal overflow at
  360px, 430px, iPad portrait/landscape, and desktop.
- [ ] Run focused unit/component tests, `npm run test:unit`, lint, typecheck,
  local DB suite, and synthetic responsive Playwright coverage when the guarded
  test environment is available. Commit as
  `feat: add provider and specialty administration` after UI/security review.

### P3-08 — Internal procedure administration UI

**Files:**

- Create: `src/app/(emr)/settings/procedures/page.tsx`
- Create: `src/app/(emr)/settings/procedures/loading.tsx`
- Create: `src/app/(emr)/settings/procedures/actions.ts`
- Create: `src/app/(emr)/settings/procedures/procedure-list.tsx`
- Create: `src/app/(emr)/settings/procedures/procedure-form.tsx`
- Create: `src/app/(emr)/settings/procedures/procedure-list.test.tsx`
- Create: `src/app/(emr)/settings/procedures/actions.test.ts`
- Modify: `src/components/layout/navigation-items.ts`
- Modify: `src/components/layout/navigation-items.test.ts`

**Interfaces:**

- Consumes P3-06 procedure services and P3-04 provider/specialty bounded
  selection DTOs.
- Produces a private procedure catalog management route with no public
  projection or scheduling controls.

- [ ] Write failing component/action tests for duration/buffer validation,
  mode options, specialty requirement levels, explicit eligible-provider
  selection, invalid/foreign IDs, revoked permission, archive confirmation,
  and generic safe errors.
- [ ] Implement the permission-checked page/action pattern from P3-07. The
  form supports code/name/description/duration/buffers, active and website/
  booking flags, `REQUIRES_REVIEW`/`REQUEST_ONLY`, specialty requirements, and
  explicit provider eligibility. It contains no price, auto-confirm, resource,
  availability, or public-link field.
- [ ] Make the semantic desktop/tablet table dense and readable; on phone use
  a compact list and single-column form. Preserve input across client validation
  errors, provide explicit archive confirmation, return dialog focus, and keep
  touch controls at least 44px.
- [ ] Add the procedure navigation route with `provider.read`, preserving direct
  server authorization and no organization identifiers in URLs.
- [ ] Run the focused and complete local verification commands from P3-07 and
  commit as `feat: add procedure administration` after independent UI and
  authorization review.

### P3-09 — Integrated verification and Phase 3 acceptance

**Files:**

- Modify: `docs/AI_HANDOFF.md`
- Create: `docs/PHASE3_ACCEPTANCE_REVIEW.md` only after all acceptance evidence
  and a human decision exist.

- [ ] Reconstruct from Git using `npm run db:start:local`,
  `npm run db:reset:local`, and `npm run db:provision:local`; then run
  `npm run test:db:local`. Expected: all Phase 1–3 pgTAP and applicable
  concurrency suites pass using synthetic data only.
- [ ] Run `npm run security:migrations`, `npm run lint`, `npm run typecheck`,
  `npm run test:unit`, `npm run security:secrets`, `npm run security:audit`,
  `git diff --check`, and `npm run build` with only the repository's approved
  non-production environment setup. Record exact results, never secrets.
- [ ] Independently attempt forged organization/branch/provider/specialty/
  procedure IDs, owner/admin/staff role changes, permission/membership
  revocation after load, direct base-table access, anonymous/service-role RPC
  access, cross-tenant associations, unsafe SECURITY DEFINER search paths,
  audit failure atomicity, and client-bundle secret exposure.
- [ ] Perform synthetic manual QA for Provider, Specialty, and Procedure
  screens at phone/tablet/desktop widths, including keyboard-only navigation,
  focus return, labels, errors, touch targets, overflow, no sensitive content
  in screenshots, and no dashboard/card-grid drift.
- [ ] Record the final checkpoint, command results, residual Cloud TEST
  pre-production obligations, and no-production-use statement in the handoff.
  Obtain an independent review and explicit project-owner acceptance before
  creating a Phase 3 acceptance record.

## Dependency Graph

```text
P3-00 plan approval
  └─ P3-01 provider permission contract
       └─ P3-02 provider/specialty schema
            └─ P3-03 provider/specialty mutations
                 └─ P3-04 provider/specialty reads and services
                      └─ P3-05 procedure/qualification schema and RPCs
                           └─ P3-06 procedure services
                                └─ P3-07 provider/specialty UI
                                     └─ P3-08 procedure UI
                                          └─ P3-09 closeout
```

## Rollback and Recovery

Phase 3 is additive. Before a migration is applied, correct it in Git and
rerun the local reconstruction. Once configuration rows exist, recovery means
disabling the affected private route and applying a reviewed forward migration;
do not drop provider, specialty, procedure, relation, or audit data. Archive
provider/procedure records rather than hard delete them. A future schedule,
website, or billing phase must tolerate inactive/archive configuration records
and must not infer historic appointment or charge meaning from current catalog
values.

## Production Gate

Phase 3 local acceptance does not authorize production provider or patient use.
Before production, run the ADR-020 guarded Cloud TEST migration/type/RLS/
authorization/E2E checks on the designated TEST project, plus every separate
security-architecture production gate.
