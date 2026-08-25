# AI Handoff — P2-04 patient creation ready for review

> Rolling handoff between coding agents. The repository, approved plans,
> migrations, tests, ADRs, and Git history remain authoritative.

## Current checkpoint

- Project-owner workflow decision: for the remaining Phase 2 checkpoints, the
  implementing agent performs and records the required security/schema/concurrency
  self-review. Do not pause for a separate reviewer unless the owner requests one
  or a stop condition applies.
- P2-03 is accepted by the project owner following local verification and a
  follow-up schema/RLS review with no material findings.
- P2-04 implementation is ready for its mandatory independent security and
  concurrency review. Do not begin the create UI until the review is accepted.
- Active work: `P2-04 — Transactional patient creation and duplicate warning` on
  branch `feat/p2-03-patient-contacts` in
  `.worktrees/p2-03-patient-contacts`, based on merged `main` `875695b`.
- Implementation is ready for the required independent schema/RLS review. Do
  not begin P2-04 until the review is accepted.
- P2-03 follows the accepted ADR-020 hybrid verification model: local Supabase
  is the checkpoint database; guarded Cloud TEST remains deferred to P2-12
  closeout and before production.

## P2-04 implementation summary

- Added a private organization-scoped patient-number counter and narrow
  `find_duplicate_candidates` and `create_patient` SECURITY DEFINER RPCs.
  The RPCs derive the actor from `auth.uid()` and tenant from an authorized
  acting branch, acquire an organization-scoped transaction advisory lock, rerun
  exact duplicate signals, allocate the counter, create initial contacts, and
  append an opaque audit event atomically.
- Added an exact authenticated-only grant terminal. Patient tables, counters,
  helpers, and the RPCs remain inaccessible to `service_role`.
- Added shared patient creation schemas, DTOs, RPC adapter/error mapping,
  generated RPC declarations, pgTAP workflow coverage, and focused Vitest tests.

## P2-03 implementation summary

- Added `20260825010000_patient_contacts_relationships.sql` only. It creates
  `patient_contacts` and `patient_relationships`, with composite patient FKs,
  archive/version/timestamp conventions, bounded values, allowed type/status
  checks, tenant-scoped indexes, and a partial unique index enforcing one active
  primary contact per patient/contact type.
- Added private, immutable mobile and email normalization helpers. Mobile values
  canonicalize approved Philippine forms to E.164; email values require
  NFKC-normalized ASCII and use only ASCII case mapping. The helpers and both
  tables explicitly revoke `PUBLIC`, `anon`, `authenticated`, and `service_role`
  privileges.
- Both child tables have RLS enabled with SELECT-only policies using the existing
  shared-patient demographics helper. No table or RPC grant was introduced.
- Added the rollback-bounded `patient_contacts_relationships.test.sql` pgTAP
  suite and registered it in both local and guarded-cloud runner paths. Coverage
  includes tenant-safe FKs, self/exactly-one relationship constraints, primary
  contact uniqueness, required relationship index order, direct privilege denial,
  and isolated RLS behavior for an authorized dentist versus an owner.
- Updated migration-lint inventory assertions for the two tables, two private
  functions, and two policies added by this checkpoint.

## Verification evidence

- Fresh local Supabase reset applied all 14 committed migrations and the
  synthetic seed successfully.
- Local non-production pgTAP provisioning passed.
- `npm run test:db:local` passed all 10 registered suites, including the new
  P2-03 suite.
- `npm run security:migrations` passed (14 migrations, 304 parsed statements,
  121 privilege statements, and no unapproved grants).
- `npm run test:unit` passed: 27 files, 332 tests.
- `npm run lint`, `npm run typecheck`, `npm run security:secrets`, and
  `npm run security:audit` passed.
- `npm run build` passed with the documented synthetic development environment
  values; a build with no environment values correctly fails the existing
  deployment-separation guard.
- The local Supabase stack was stopped after verification. No Cloud TEST target,
  production credential, or real data was used.

## Review focus

- Confirm the mobile/email normalization contracts precisely match P2-03 scope.
- Confirm all child-table access remains privilege-denied without test-only
  rollback grants and that RLS cannot reveal an otherwise denied patient.
- Confirm relationship FKs and checks prevent cross-tenant, self, and dual-party
  records, while preserving external and related-patient guardian paths.
