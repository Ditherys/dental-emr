# Audit Foundation

P1-19 hardens the existing `public.audit_events` foundation for administrative
and security accountability. Audit events remain distinct from application
troubleshooting logs and are not a second store for request bodies or clinical
content.

## Stored context

An event records the tenant, optional branch, actor, category, action, target,
result, timestamp, and opaque request/correlation identifiers. New events receive
a generated correlation ID when a writer does not supply one. Correlation and
request IDs accept only bounded identifier characters; URLs and arbitrary text
are rejected.

Audit metadata is limited to a 1 KiB allowlist used by current foundation
writers:

- `invitation_id`: UUID only;
- `permission_code`: bounded permission-code format;
- `role_code`: bounded role-code format;
- `scope`: `ORGANIZATION` or `BRANCH`.

No free-form metadata key exists. Passwords, access/refresh tokens, Supabase
keys, invitation plaintext tokens, MFA setup material/codes, presigned URLs,
request bodies, patient data, and clinical text must never be added to this
allowlist.

## Write and read boundaries

`anon` has no audit access. `authenticated` has SELECT only, and RLS requires
the tenant/branch-scoped `audit.read` permission. Normal users have no INSERT,
UPDATE, or DELETE grant. A trigger rejects UPDATE and DELETE even for privileged
writers.

Administrative functions write their success event in the same database
transaction as the protected mutation. A failed audit insert therefore rolls
back the administrative change.

`public.record_mfa_enrollment(uuid)` is the only authenticated P1-19 audit RPC.
It derives the actor from `auth.uid()`, requires AAL2, verifies that the supplied
factor is a verified TOTP factor owned by that actor, derives all active tenant
memberships in the database, and inserts an organization-level event for each.
The `(organization, actor, factor, action)` projection is idempotent. It accepts
no organization, branch, result, metadata, token, code, secret, or actor input.

Supabase Auth remains the factor system of record. Because factor verification
and application audit insertion are separate service transactions, the MFA UI
does not claim full success until the audit projection succeeds and provides an
idempotent retry without retaining the setup key or one-time code.

## MFA factor removal — reconciliation semantics (R3)

Enrollment is projected into audit history. **Removal currently is not.**
`docs/plans/001-foundation.md` lists `mfa.removed` as *"(later/privileged)"*, so
this is a recorded deferral rather than a missed Phase 1 requirement. What was
missing — and is written down here so the later implementation cannot quietly
choose the easy wrong answer — is the reconciliation model.

### The constraint that shapes everything

Supabase Auth and the application database are **separate services with separate
transactions**. `auth.mfa.unenroll()` succeeding tells you nothing about whether
a subsequent audit insert will succeed, and no amount of application code makes
the pair atomic. Any design claiming otherwise is claiming something PostgreSQL
cannot deliver here.

Three consequences follow, and they are not negotiable:

1. **The factor store is the system of record; audit history is a projection of
   it.** When they disagree, Auth is right and the projection is incomplete.
2. **A projection may therefore be late, but must never be wrong.** Recording
   `mfa.removed` for a factor that still exists is worse than recording nothing:
   it would make an attacker's retained factor look revoked.
3. **Removal cannot be verified after the fact the way enrollment can.**
   `record_mfa_enrollment` proves its claim by reading `auth.mfa_factors` and
   confirming the factor exists, is TOTP, is verified, and belongs to the caller.
   After an unenroll, the row is gone — absence is indistinguishable from "never
   existed" and from "belongs to someone else". A removal RPC must therefore
   **capture the assertion before the removal**, not attempt to prove it after.

### The intended design

- A pre-removal RPC records the intent (actor from `auth.uid()`, AAL2 required, factor ownership verified against `auth.mfa_factors` **while the row still exists**), returning a token-free correlation the caller carries into the unenroll call.
- The application then calls `auth.mfa.unenroll()`.
- A post-removal RPC finalizes the event, idempotently, keyed on the same `(organization, actor, factor, action)` projection that enrollment already uses.
- If finalization fails, the UI does not claim success and offers an idempotent retry, exactly as the enrollment flow already does. Retention of setup keys or one-time codes remains forbidden.
- A reconciliation read — factors present in Auth versus factors with an unfinalized removal intent — surfaces the gap rather than hiding it. An intent without a finalization is a *reportable inconsistency*, not a silent success.

### What must not be done

- Do not emit `mfa.removed` optimistically before Auth confirms the unenroll.
- Do not weaken or bypass Supabase's own AAL2 requirement to make removal auditing easier.
- Do not infer removal by polling for a missing factor row: absence has too many causes.
- Do not store factor secrets, setup keys, or one-time codes anywhere in this path.

Implementation requires a new migration and is therefore deferred until after the
R6-F reconciliation, for the reason recorded in
`docs/PHASE1_ACCEPTANCE_REVIEW.md` (M-2).

## Verification and remaining gates

`supabase/tests/audit_foundation.test.sql` proves the metadata boundary, function
privileges/search path, AAL2 and factor ownership checks, active-tenant scoping,
idempotency, direct-forgery denial, and append-only history.

P1-19 does not add an audit viewer, retention/archive automation, security-event
alerting, or later-domain events. Retention categories and tamper-resistant
archive policy remain production gates under `docs/SECURITY_ARCHITECTURE.md`.
