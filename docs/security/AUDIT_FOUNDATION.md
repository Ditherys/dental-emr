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

## Verification and remaining gates

`supabase/tests/audit_foundation.test.sql` proves the metadata boundary, function
privileges/search path, AAL2 and factor ownership checks, active-tenant scoping,
idempotency, direct-forgery denial, and append-only history.

P1-19 does not add an audit viewer, retention/archive automation, security-event
alerting, or later-domain events. Retention categories and tamper-resistant
archive policy remain production gates under `docs/SECURITY_ARCHITECTURE.md`.
