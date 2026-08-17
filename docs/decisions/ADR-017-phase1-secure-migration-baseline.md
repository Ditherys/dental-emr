# ADR-017 — Phase 1 secure migration baseline and the grant-last fail-closed invariant

**Status:** Accepted for R6-A (baseline authored in Git). Reconciliation with the linked DEV project and empirical validation remain outstanding — see "Outstanding work" below.
**Date:** 2026-08-13
**Decision owner:** Project owner
**Supersedes:** the thirteen Phase 1 foundation migration files listed below
**Related:** [ADR-016](ADR-016-supabase-cloud-first-development.md), [ADR-003](ADR-003-authorization-defense-in-depth.md), [ADR-002](ADR-002-organization-branch-tenancy.md), `docs/DATABASE_DESIGN.md` §36, `docs/SECURITY_ARCHITECTURE.md`, `docs/plans/001-foundation.md`

## Context

### The confirmed H2 weakness

An independent repository review of the Phase 1 exit findings confirmed a real intermediate weaker-authorization window in the committed migration chain.

`20260812050800_foundation_rls_policies.sql` granted `authenticated` direct column-level `INSERT`/`UPDATE` and table-level `DELETE` on sensitive foundation tables — `organizations`, `branches`, `organization_members`, `roles`, `role_permissions`, `branch_memberships`, `member_roles` — with authorization carried solely by fifteen `*_insert_manager` / `*_update_manager` / `*_delete_manager` RLS policies gated on `private.has_org_permission(...)`.

`20260812051000_harden_foundation_admin_mutations.sql` revoked every one of those write grants, dropped all fifteen mutation policies, and replaced them with five AAL2-gated, transactional, audited `SECURITY DEFINER` RPCs.

`20260812050900_consolidate_foundation_rls_select_policies.sql` sits between them and changes only `SELECT` policies, so **two** committed migration boundaries — after `050800` and after `050900` — expose the weaker state.

At those two boundaries the database was missing, relative to the accepted final state:

- the AAL2 step-up gate (`private.require_aal2()` does not exist until `051000`);
- anti-self-escalation checks;
- permission-superset delegation checks;
- the organization-scoped advisory lock;
- audit-event emission.

An actor holding `role.manage` could therefore, at AAL1 and without producing an audit record, escalate their own effective permissions by direct Data API DML.

### What the weakness is not

Recording this precisely matters, because it determines why the remedy was chosen:

- **Not a cross-tenant break.** The mutation policies were organization-scoped. Organization isolation held at both boundaries.
- **Not an `anon` exposure.** `050800` revoked `anon` before granting, and no `anon` policy exists anywhere in Phase 1.
- **Not an RLS gap earlier in the chain.** Every `CREATE TABLE` in the superseded chain enabled RLS in the same file. Boundaries 1–8 were fail-closed at the policy layer.
- **Not a defect in the accepted final schema.** The final Phase 1 schema is hardened and correct. The vulnerability was a property of the migration **path**, not of the destination.

### Why an additive migration could not fix it

The weak state exists at replay positions 9 and 10 of 13. A new file at position 14 executes after the window has already opened and closed; a reconstruction interrupted at position 9 never reaches it. The defect is a property of the ordering, and appending cannot change what precedes.

### The structural rule the remedy must buy

> A migration set that grants privileges and then narrows them is unsafe by construction, because the wide state is committable. A migration set that only ever grants at the end is safe by construction, because every intermediate boundary is more restrictive than the final state.

## Decision

### 1. Replace the Phase 1 chain with a grant-last secure baseline

The thirteen superseded files are removed from the active `supabase/migrations/` directory and replaced by eight reviewable, dependency-ordered baseline files. Git history preserves the superseded SQL; it is **not** copied into any other active-looking directory.

| # | Baseline file | Contents |
|---|---|---|
| 1 | `20260813020000_baseline_private_helpers.sql` | `private` schema, `private.set_updated_at()` (renamed in R6-C1; pgTAP removed — see ADR-018) |
| 2 | `20260813020100_baseline_tenancy_and_membership.sql` | `organizations`, `branches`, `profiles`, `organization_members` |
| 3 | `20260813020200_baseline_roles_and_assignments.sql` | `roles`, `permissions`, `role_permissions`, `branch_memberships`, `member_roles`, system-role seed |
| 4 | `20260813020300_baseline_audit_foundation.sql` | `private.audit_metadata_is_safe`, `audit_events` incl. all P1-19 hardening |
| 5 | `20260813020400_baseline_workforce_invitations.sql` | `private.workforce_invitations`, `private.user_has_permission`, `private.validate_workforce_invitation_scope`, eight invitation RPCs |
| 6 | `20260813020500_baseline_authorization_helpers_and_policies.sql` | five RLS helpers, `private.require_aal2()`, the final RLS policy set |
| 7 | `20260813020600_baseline_administrative_rpcs.sql` | five AAL2-gated administrative RPCs + `public.record_mfa_enrollment` |
| 8 | `20260813020700_baseline_final_grants.sql` | **the only file that grants** |

### 2. The grant-last fail-closed invariant

**Files 1 through 7 grant nothing to `PUBLIC`, `anon`, or `authenticated`. File 8 is the only file that grants.**

Crucially, the invariant is enforced **by explicit revocation, not by the absence of a `GRANT`**. Two default-privilege mechanisms would otherwise hand out access silently:

- PostgreSQL grants `EXECUTE` on every new function to `PUBLIC` by default. For a `SECURITY DEFINER` function this is a live definer-rights escalation path from the instant of creation.
- Supabase projects carry `ALTER DEFAULT PRIVILEGES` granting new objects in `public` to `anon`, `authenticated`, and `service_role`. In the superseded chain, newly created tables inherited broad privileges and were held closed only by RLS-with-no-policies.

Therefore every object in the baseline **revokes its inherited and default privileges in the same statement sequence that creates it**, adjacent to the `CREATE`, rather than in a batch at the end of a file.

### 3. The security guarantee does not rest on transaction semantics

The invariant is deliberately structural. It does **not** assume that an individual migration file is atomic, that a whole `db push` is atomic, or that current Supabase CLI execution semantics will persist. Because privileges are revoked statement-adjacently and granted only in file 8, an interruption at *any* point — between files or between statements — leaves a state strictly more restrictive than the final one.

No stronger transaction guarantee than the official tooling documents is claimed anywhere in the baseline. R6-D will test boundary behaviour empirically.

### 4. `ALTER DEFAULT PRIVILEGES` is deliberately NOT used

`ALTER DEFAULT PRIVILEGES` is role-specific: it applies only to objects created by the role named in `FOR ROLE`. Applying it against the wrong role is a silent no-op that would produce false confidence.

R6-A is a Git-only checkpoint with no database contact, so the role that actually owns and creates objects during `supabase db push` **could not be verified**. Explicit per-object `REVOKE` is correct regardless of the creating role, so the baseline uses only explicit revocation.

Adding a reviewed `ALTER DEFAULT PRIVILEGES` as a belt-and-braces layer remains a candidate **after R6-C/D empirically determine the creating role**. It is deferred, not rejected, and requires separate human approval.

### 5. Scope of the invariant: browser-reachable roles

The invariant is asserted for `PUBLIC`, `anon`, and `authenticated` — the roles reachable from a browser holding a publishable key.

`service_role` is explicitly **out of scope**. It is a server-only role whose secret key must never reach browser code, it carries `BYPASSRLS` by design, and the accepted Phase 1 schema leaves it holding Supabase's default privileges on the ten `public` tables. **R6-A changes nothing about `service_role`**, because R6 is migration-architecture remediation, not authorization redesign. Its privileges at every baseline boundary are identical to its privileges in the accepted final state.

### 6. Phase 2 and beyond

Phase 1 is consolidated into a baseline; Phase 2 resumes small, reviewable domain migrations per `DATABASE_DESIGN.md` §36.2. The grant-last rule becomes a standing project rule for every future migration set:

> Privileges to `authenticated` / `anon` are granted only in the final file of a migration set, and are never broadened and later narrowed.

R6-B adds static and dynamic enforcement of this rule so it cannot silently erode as patients, scheduling, clinical, and billing tables arrive. See section 7.

### 7. How the invariant is enforced (R6-B)

A rule that lives only in prose erodes. The invariant is therefore mechanically enforced, in two layers with deliberately different failure modes.

#### 7.1 Static enforcement — `npm run security:migrations`

`scripts/migration-privilege-lint.mjs` parses every active migration into statements and evaluates rules over a structured privilege model. It is offline and contacts no database. It runs in `npm run verify` and in the CI application job.

It is explicitly **not** a keyword search for `GRANT INSERT`. The H2 defect class includes several forms that no such search would catch, and each has a rule and a negative fixture:

| Vector | Rule |
|---|---|
| `GRANT` on tables/columns/schemas/sequences/functions before the terminal file | `grant-outside-terminal-migration` |
| A new function keeping PostgreSQL's default `PUBLIC EXECUTE` | `creation-not-fail-closed` / `security-definer-not-fail-closed` |
| A new table inheriting Supabase's default privileges | `creation-not-fail-closed` |
| `ALTER DEFAULT PRIVILEGES` | `alter-default-privileges` |
| `GRANT <role> TO authenticated` (role membership) | `role-membership-grant` |
| `GRANT ... ON ALL TABLES IN SCHEMA public` | `unapproved-grant` |
| `GRANT` assembled at run time inside a function body or `DO` block | `dynamic-privilege-statement` |
| `WITH GRANT OPTION` | `grant-option` |
| An unqualified grant target resolved through `search_path` | `unqualified-grant-target` |
| A Data API table created without RLS | `public-table-without-rls` |
| A definer-rights function without `set search_path = ''` | `function-search-path` |

**The approved final privilege set is data, not code.** `scripts/approved-final-grants.mjs` records all 30 approved privileges — 22 to `authenticated`, 8 to `service_role`, none to `anon` or `PUBLIC` — each with the reason it exists. The comparison is exact in both directions and column-precise: an extra privilege fails, and a privilege the approved list still records but the migration no longer grants also fails, because a stale allowlist is a false record of the boundary. Changing the set requires editing that file, which is a review-visible diff stating what changed and why.

**The checker fails closed.** Anything unparseable in a privilege-relevant position — a malformed file, an unmodelled object class, a `GRANT` form the parser does not understand, an empty migration, a renamed terminal migration — is reported as a violation. It never passes because it failed to look.

**Deliberate conservatism** (documented expected false positives): a migration outside a registered terminal file may contain no `GRANT` at all, even to `service_role`; `ALTER DEFAULT PRIVILEGES` is refused everywhere; a covering `REVOKE` must be `REVOKE ALL` and must name the object explicitly; an unnamed multi-word-typed function parameter may not resolve, in which case the author must name the parameter. Each of these fails loudly rather than silently.

The checker is proven to **catch** the defect, not merely to agree with today's files: `scripts/fixtures/migration-privilege-lint/` holds synthetic unsafe migrations — including `GRANT INSERT ON public.roles TO authenticated` and an unrevoked `SECURITY DEFINER` function — that the test suite asserts are rejected. They live outside `supabase/migrations/`, carry a `FIXTURE_NOT_A_MIGRATION` marker, and a test asserts no active migration contains that marker.

#### 7.2 Dynamic enforcement — R6-D, `--mode=file` executed; `--mode=statement` outstanding

Static analysis proves the files *say* the right thing. It cannot prove what PostgreSQL *does*: default privileges, role inheritance, ACL retention across `CREATE OR REPLACE`, and Supabase's own project defaults all live outside the SQL text.

`supabase/verification/r6d/` and `scripts/boundary-privilege-invariant.mjs` close that gap by comparing **effective** privileges (`has_table_privilege`, `has_column_privilege`, `has_function_privilege`, `has_schema_privilege`, `has_sequence_privilege`, and `aclexplode` over `coalesce(acl, acldefault(...))` for `PUBLIC`) against a platform baseline measured on the target project before any baseline migration is applied.

Two properties make a passing run mean something:

- **The comparison is relative to a measured baseline**, not to a guess at Supabase's defaults, so it stays correct when those defaults change.
- **A blind probe cannot read as a clean result.** The tooling refuses a snapshot in which the browser-reachable roles were not found, in which fewer objects were examined than the applied migrations create, in which its view shrank between boundaries, or which is missing or malformed.

The live authorization probe uses a synthetic actor holding the system `OWNER` role — the exact actor the superseded chain *would* have permitted every prohibited operation — and runs four meaningfulness controls before any prohibited attempt, so a refusal is a privilege boundary rather than a powerless user.

The decision logic is unit-tested offline. **`--mode=file` has been executed against a fresh, empty Cloud TEST project and passes cleanly** (see `docs/AI_HANDOFF.md`'s current checkpoint). `--mode=statement` has not yet run, and R6-D as a whole remains outstanding and separately approval-gated until both modes pass and the checkpoint receives independent review.

## Superseded migrations

The accepted final schema was **not** the vulnerability. These files are superseded because of the ordering defect described above; their destination state is preserved verbatim in the baseline.

| Version | Filename | Introduced in |
|---|---|---|
| 20260812050000 | `extensions_and_private_schema.sql` | `d2b8edb` feat: add foundation database schema |
| 20260812050100 | `organizations_and_branches.sql` | `d2b8edb` |
| 20260812050200 | `profiles_and_organization_members.sql` | `d2b8edb` |
| 20260812050300 | `roles_and_permissions.sql` | `d2b8edb` |
| 20260812050400 | `branch_memberships_and_member_roles.sql` | `d2b8edb` |
| 20260812050500 | `audit_events.sql` | `d2b8edb` |
| 20260812050600 | `workforce_invitations.sql` | `99d84a5` feat(auth): add invitation-only workforce onboarding |
| 20260812050700 | `require_organization_scope_for_invitations.sql` | `99d84a5` |
| **20260812050800** | **`foundation_rls_policies.sql`** | `a827f07` feat(db): add foundation RLS policies — **opens the H2 window** |
| 20260812050900 | `consolidate_foundation_rls_select_policies.sql` | `a827f07` — SELECT-only; window remains open |
| **20260812051000** | **`harden_foundation_admin_mutations.sql`** | `d77a9e7` security: harden P1-11 authorization boundaries — **closes the H2 window** |
| 20260812051100 | `enforce_authorization_delegation.sql` | `d77a9e7` |
| 20260813010000 | `harden_audit_foundation.sql` | `9c31f7e` feat(security): harden audit foundation |

Where the chain replaced an object more than once, the baseline carries **only the final definition**: `private.user_has_permission` from `050700`, `private.has_branch_access` from `051000`, and `private.validate_workforce_invitation_scope`, `public.list_workforce_invitation_options`, `public.finalize_workforce_invitation`, `public.set_member_role` from `051100`.

## Intentional temporary DEV history divergence

From this checkpoint until R6-F completes, the linked Supabase Cloud DEV project's `supabase_migrations.schema_migrations` table intentionally disagrees with the local baseline: DEV holds the thirteen superseded versions and none of the eight baseline versions.

**This divergence is expected, intentional, and temporary.** It is not drift to be "fixed" by pushing.

DEV's *schema* is unaffected. DEV already sits at the accepted hardened final state, and R6-A contacted no database.

A migration freeze is in force for the duration — see `supabase/MIGRATION_FREEZE.md`. Until R6-F, no `db push`, `migration up`, `migration repair`, `db reset`, schema-changing SQL, or migration deployment may run against DEV.

### R6-F reconciliation requirement

Reconciliation must mark the thirteen superseded versions reverted and the eight baseline versions applied, using `supabase migration repair`. That command mutates only the migration-history table; it performs no schema or data change and is reversible by restoring the recorded rows.

**Reconciliation is gated on proving equivalence first.** Marking a baseline "applied" against a database not proven to match it would make every subsequent Phase 2 migration rest on a false premise. The order is: build a disposable Cloud TEST project from the baseline (R6-C) → prove boundary fail-closure and schema equivalence (R6-D, R6-E) → only then repair DEV (R6-F).

### Cloud-only equivalence strategy

`supabase db diff` may use a local shadow database or container. ADR-016 forbids introducing a local Supabase runtime or a Docker requirement, so **Docker-based `db diff` must not be a mandatory verification step**.

R6-E must therefore prove equivalence using remote-safe mechanisms only — for example remote schema/catalog dumps, normalized `pg_catalog` / `information_schema` comparisons, targeted object-definition comparison (`pg_get_functiondef`, `pg_get_expr` for policies and constraints), effective-privilege probes via `has_table_privilege` / `has_column_privilege` / `has_function_privilege`, and comparison of the committed generated types. Privilege comparison must be **semantic** (effective privilege), not textual ACL comparison, because consolidation legitimately changes how some ACLs are represented without changing effective access. The exact R6-E method is not fixed by this ADR and requires its own review.

## pgTAP: recorded, not silently decided

> **RESOLVED in R6-C1 by [ADR-018](ADR-018-nonproduction-database-test-tooling.md): option (c).** The canonical baseline now creates no extension; pgTAP moved to `supabase/provisioning/nonproduction/`, applied only to DEV and disposable Cloud TEST projects, and the empty `APPROVED_EXTENSIONS` list makes any `CREATE EXTENSION` in a migration a lint violation. The rest of this section records the reasoning as it stood at R6-A and is retained for history.

`create extension if not exists pgtap with schema extensions` was present in the superseded chain and was **retained unchanged** in baseline file 1 at R6-A.

The concern is real: pgTAP is a testing extension, and installing it in a future production project is unnecessary attack surface and schema-introspection surface. It is not directly Data API-callable (the `extensions` schema is not exposed through PostgREST), so this is a hygiene issue rather than a live escalation path.

It was retained rather than removed because removing it would create **per-environment schema drift** — different schemas for DEV/TEST and production — which is precisely the outcome the project has asked to avoid, and because R6 is remediation, not redesign. Changing it would alter the approved architecture.

**This is therefore an open decision requiring human approval, not a decision made here.** The options:

- **(a) Keep in the canonical baseline** *(current state)* — zero drift, simplest reconstruction, pgTAP reaches production.
- **(b) DEV/TEST provisioning only** — production stays clean, but introduces a deliberate, documented environment difference that every equivalence check must then account for.
- **(c) Environment-gated mechanism** — e.g. a separate non-canonical provisioning step applied only to non-production projects; keeps the canonical baseline production-shaped at the cost of an extra step in the TEST bootstrap.

Recommendation for later decision: **(c)**, deferred to the production-bootstrap gate, so no drift is introduced during Phase 1 while production never receives a test extension. No action is taken in R6-A.

## Consequences

### Benefits

- The insecure intermediate boundary is eliminated structurally, not patched.
- Every baseline boundary is strictly more restrictive than the final state, independent of transaction semantics.
- A fresh TEST or production project can never reach a committed state where a browser-reachable role holds direct administrative table-write capability.
- Production bootstrap becomes a single deterministic replay of eight reviewed files.
- The grant-last rule generalises to every future phase.

### Tradeoffs and risks

- Granular replay of the Phase 1 chain no longer exists in the working tree; it exists only in Git history.
- DEV's history will be *asserted* by repair rather than *replayed*, making the equivalence proof in R6-E mandatory rather than optional.
- The baseline is a large one-time review, which is why it must not be self-reviewed by the implementing agent.
- Full equivalence between the baseline and the accepted schema is **not proven by R6-A**. It is a reviewed authoring claim until R6-C/D/E execute.

## Outstanding work

| Step | Scope | Status |
|---|---|---|
| R6-A | Author baseline + ADR in Git; no database contact | **Complete (this ADR)** |
| R6-B | Static grant-last lint (enforced in `verify` + CI) and dynamic boundary-invariant tooling **authored only** | **Complete**; no database contact. See section 7 |
| R6-C1 | Separate database test tooling from the canonical baseline; mandatory `SUPABASE_DEV_PROJECT_ID`; one-slot TEST runbook | **Complete**; no database contact. See [ADR-018](ADR-018-nonproduction-database-test-tooling.md) |
| R6-C | Create disposable Cloud TEST project from zero | **Complete** — executed against TEST-01, 2026-08-14 (`P1_PROVISION_PASS`; see `docs/evidence/R6C-R6E-test01.md`). TEST-01 has since been deleted; the proof stands as a historical execution, not a standing environment |
| R6-D | Interrupted-replay boundary validation | **Partially complete** — `--mode=file` passes against a fresh, empty Cloud TEST project (see `docs/AI_HANDOFF.md`'s current checkpoint); `--mode=statement` not started, requires approval |
| R6-E | Cloud-safe equivalence + full verification | **Complete against TEST-01** (2026-08-14; see `docs/evidence/R6C-R6E-test01.md` and `docs/evidence/R6E-catalog-comparison.md`). Whether a fresh re-verification against the current TEST-02 is also required is an open decision, not a first run |
| R6-F | Reconcile DEV migration history via `migration repair` | Not started — requires approval; gated on R6-D `--mode=statement` and the R6-E re-verification decision |

## Independent review requirement

**Codex was unavailable when this checkpoint was authored. No independent review has occurred, and none is claimed.**

R6-A changes security-sensitive migration architecture and must receive an independent Codex review before it is treated as accepted. That review must independently verify, at minimum:

1. that the baseline is semantically equivalent to the accepted final schema — table, constraint, index, trigger, policy, function, and grant by grant — and not merely that it looks right;
2. that the grant-last property genuinely holds, including column privileges, function `EXECUTE`, schema privileges, sequence privileges, default privileges, role inheritance, and `PUBLIC`;
3. that every `SECURITY DEFINER` function is created fail-closed and retains `set search_path = ''`;
4. that the five administrative RPCs and `record_mfa_enrollment` preserve AAL2 gating, anti-self-escalation, permission-superset checks, the organization-scoped advisory lock, and audit emission;
5. that the migration-freeze guard is correctly scoped and cannot be bypassed by the guarded npm command paths;
6. that this ADR does not overstate what R6-A proves.

R6-B adds a second review surface with its own questions:

7. that the static lint's parser is not defeatable — quoted identifiers, dollar-quoted bodies, nested comments, `CREATE OR REPLACE`, overloaded signatures, wildcard grants, role membership, and dynamic SQL;
8. that its rules genuinely cover the H2 class rather than the current file set, and that the negative fixtures fail for the reason claimed;
9. that the approved final privilege set in `scripts/approved-final-grants.mjs` matches `20260813020700_baseline_final_grants.sql` privilege by privilege, column by column;
10. that the R6-D SQL is correct — `--mode=file` has executed and passed against a fresh Cloud TEST project, but `--mode=statement` has never been executed, and its own catalog assumptions and pgTAP assertions remain unverified;
11. that the R6-D vacuity guards actually prevent a blind probe from reading as a clean result;
12. that the scoped freeze acknowledgement narrowed the bypass rather than widening it.
