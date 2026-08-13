# Evidence — R6-C reconstruction and R6-E verification on TEST-01

**Date:** 2026-08-14
**Project:** `dental-emr-test-01`, region `ap-southeast-1`, Postgres `17.6.1.155`
**Comparison target:** `dental-emr-dev`, region `ap-southeast-1`, Postgres `17.6.1.155` — **same region and same Postgres version**, which removes a class of false differences from the equivalence comparison.
**Operator:** project owner created and linked the project and applied the baseline; Claude Code ran the verification steps below.
**Linked-target confirmation:** `dental-emr-dev` reported `linked: false` throughout; the linked reference matched `SUPABASE_TEST_PROJECT_ID` and differed from `SUPABASE_DEV_PROJECT_ID` on every guarded command.

Project references, keys, passwords, and tokens are deliberately absent from this
file. It records what was proven, not how to connect.

## R6-C — reconstruction from the baseline alone

| Step | Result |
|---|---|
| `supabase migration list --linked` | All eight baseline versions `20260813020000`…`20260813020700` present, local == remote. No superseded version present. |
| `npm run ci:test-target` | Cloud TEST environment metadata internally consistent. |
| `npm run db:provision:test` | `PASS db-provision-test-tooling (P1_PROVISION_PASS)`. **This step had been missed**; pgTAP was absent, so every database suite would have failed at its first `extensions.no_plan()` call. The catalog-read sentinel is what surfaced it rather than a confusing downstream error. |
| `npm run db:seed:test` | Idempotent synthetic two-tenant graph loaded. |

The eight-file baseline builds the complete Phase 1 schema on an empty project
with no manual step and no superseded migration. That is the R6-C claim, and it
now holds.

## R6-E — verification

| Check | Result |
|---|---|
| `npm run test:db` | **6/6 suites PASS**: `schema`, `foundation_rls`, `workforce_invitations`, `audit_foundation`, `session_authorization_boundaries`, `seed_security_fixtures`. |
| `npm run db:types:check:test` | "Generated database types are current" — **no drift** between the committed `src/types/database.generated.ts` and a project built from the baseline. |
| `npm run db:lint:test` | "No schema errors found". |
| `npm run db:advisors:test` | **0 ERROR, 7 WARN.** Exit 0 under `--fail-on error`. See the disposition below. |

### The four pre-existing suites are the load-bearing result

`foundation_rls`, `workforce_invitations`, `audit_foundation`, and `schema` were
written against the *superseded thirteen-migration chain*. They pass unmodified
against a project built only from the R6-A baseline. That is meaningful behavioural
evidence that the consolidation preserved the accepted schema's semantics — RLS
policies, tenant isolation, invitation delegation, AAL2 gating, audit integrity,
and the object inventory.

It is **not** a full equivalence proof. It proves the baseline satisfies every
property the existing suites assert; it does not prove no unasserted difference
exists between the baseline and DEV. The catalog-level DEV-versus-TEST comparison
remains outstanding — see "Still open".

### R5-A: one real defect, found by executing it

`session_authorization_boundaries.test.sql` failed on first execution:

```
42501: permission denied for schema private
LINE 240: (select private.has_branch_access('83000000-…'))
```

**The defect was in the test, not in the system.** The suite probed the RLS
helper functions while acting as `authenticated`, and the `private` schema and
every helper in it are revoked from that role — correctly. PostgreSQL does not
require the querying role to hold `EXECUTE` on functions referenced inside a
policy expression, which is why the policies work while a direct call does not.

Fixed by dropping the role for the helper probes while leaving the victim's JWT
claims untouched, so `auth.uid()` still resolves to the victim and the helper
still answers "what may *this* user do". The RLS-observable assertions stay under
`authenticated`. All 40 assertions then passed.

Worth stating plainly: had the suite been shipped unrun, it would have looked like
coverage and delivered none.

### Advisor disposition — 7 WARN, all reviewed

**Six × `authenticated_security_definer_function_executable`** — `create_branch`,
`set_role_permission`, `set_member_role`, `set_branch_membership`,
`update_organization_member_status`, `record_mfa_enrollment`.

**Accepted and intentional.** These six are the entire authenticated write surface
of Phase 1. They are `SECURITY DEFINER` precisely so that AAL2 step-up,
anti-self-escalation, permission-superset delegation checks, the organization-scoped
advisory lock, and audit emission all execute inside a boundary the caller cannot
skip — see ADR-003 and ADR-017. Direct table writes are revoked from
`authenticated` for exactly this reason, which `foundation_rls.test.sql` asserts.
Following the advisor's remediation literally would remove the only authorized
write path and leave nothing safer in its place.

**One × `auth_leaked_password_protection`** — **a real finding, and a gap in this
project's own R4 policy, which did not cover it.**

Leaked-password protection is disabled. Credential stuffing is the most common
route to taking over a workforce account that reaches health information, and a
length-and-character policy does nothing against a password that is already
public. The rule `password_hibp_enabled` has been added to
`scripts/hosted-auth-policy.mjs`; **the hosted setting still needs to be enabled
in the Dashboard.**

## Still open after this session

| Item | Why it is not closed |
|---|---|
| Catalog-level equivalence, TEST vs DEV | Requires a read-only connection to DEV. The CLI is linked to TEST, and re-linking mid-session would put a DEV-targeted command one mistake away. Needs a deliberate, separately approved step. |
| `npm run security:auth` | Needs `SUPABASE_ACCESS_TOKEN` in the process environment. The CLI's own session does not satisfy the script. |
| Playwright flows (R5-B, R9 matrix) | Need the three synthetic login identities and a verified owner TOTP factor. `npm run e2e:provision` now automates this; it needs `SUPABASE_SECRET_KEY`. `verified_mfa_factors` was 0 at the time of writing. |
| R6-D interrupted-boundary replay | Requires a second, genuinely fresh project (TEST-02) after TEST-01 is disposed. |
| R6-F DEV reconciliation | Gated on R6-D and R6-E both being complete. |

## Disposal

TEST-01 must not be deleted yet: R6-E's DEV comparison and the Playwright flows
still need it. Delete it only after those complete and this evidence file is
committed.
