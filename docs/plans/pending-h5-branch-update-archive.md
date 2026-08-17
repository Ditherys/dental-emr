# H-5 — Branch update/archive (implemented)

**Status: implemented 2026-08-18**, after R6-F lifted the migration freeze.
This document is kept as the historical design record; the live migration is
`supabase/migrations/20260818010000_branch_update_and_archive.sql` (applied
verbatim from the draft below), registered in
`scripts/approved-final-grants.mjs`, and verified in
`docs/evidence/H5-branch-lifecycle-verification.md`. The TypeScript/UI layer
described in the implementation spec below is also implemented — see that
evidence file for exact file locations.

## Why this is staged here instead of in `supabase/migrations/`

`scripts/run-boundary-privilege-invariant.mjs` reads every file in
`supabase/migrations/` at each invocation (`readdirSync(migrationsDirectory)`).
Adding a ninth migration file now would make any future R6-D re-run, and the
R6-E DEV-vs-TEST catalog comparison, apply/compare it too — against a DEV
project that has never seen it. That would either invalidate a fresh
equivalence proof or force explaining away a real, legitimate diff as
"expected", which is exactly the ambiguity a security-verification step
should not carry. This file exists so the design is reviewed and ready to
drop in as `supabase/migrations/<timestamp>_branch_update_and_archive.sql`
the moment R6-F completes.

## Scope

Two RPCs, matching the two actions explicitly named in
`docs/plans/001-foundation.md` §27 ("branch updated/archived") and the
existing `create_branch` pattern in
`supabase/migrations/20260813020600_baseline_administrative_rpcs.sql`:

- `update_branch` — edit business/contact/address/timezone/visibility fields
  on a non-archived branch. Code and slug are immutable identifiers and are
  not editable here.
- `archive_branch` — transition a branch to `archived`, refusing to leave an
  organization with zero non-archived branches.

No "restore"/"unarchive" RPC — not named in the Phase 1 plan; out of scope
per the "don't add unrequested features" rule until asked for.

## Draft migration SQL

```sql
-- Phase 1 secure baseline addendum — branch update/archive (H-5).
--
-- Same invariant as the baseline: every privilege-bearing object revokes
-- EXECUTE from PUBLIC, anon, authenticated, and service_role in the
-- statement immediately following its creation. This file is its own
-- registered grant-terminal migration (see approved-final-grants.mjs diff
-- below) and grants nothing else.

create or replace function public.update_branch(
  target_branch_id uuid,
  branch_name text,
  branch_address_line1 text,
  branch_city text,
  branch_province text,
  branch_phone text default null,
  branch_email text default null,
  branch_address_line2 text default null,
  branch_postal_code text default null,
  branch_timezone text default 'Asia/Manila',
  branch_website_visible boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_organization_id uuid;
  current_status text;
begin
  perform private.require_aal2();

  select branch.organization_id
  into target_organization_id
  from public.branches as branch
  where branch.id = target_branch_id;

  if not found then
    raise insufficient_privilege using message = 'not authorized to update branch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text, 0)
  );

  select branch.status
  into current_status
  from public.branches as branch
  where branch.id = target_branch_id
    and branch.organization_id = target_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized to update branch';
  end if;

  if actor_user_id is null
     or not (select private.has_org_permission(
       target_organization_id,
       'branch.manage'
     )) then
    raise insufficient_privilege using message = 'not authorized to update branch';
  end if;

  if current_status = 'archived' then
    raise invalid_parameter_value using message = 'cannot update an archived branch';
  end if;

  update public.branches
  set name = branch_name,
      phone = branch_phone,
      email = branch_email,
      address_line1 = branch_address_line1,
      address_line2 = branch_address_line2,
      city = branch_city,
      province = branch_province,
      postal_code = branch_postal_code,
      timezone = branch_timezone,
      website_visible = branch_website_visible
  where id = target_branch_id;

  insert into public.audit_events (
    organization_id,
    branch_id,
    actor_user_id,
    actor_type,
    category,
    action,
    entity_type,
    entity_id,
    result
  ) values (
    target_organization_id,
    target_branch_id,
    actor_user_id,
    'USER',
    'ADMINISTRATION',
    'branch.updated',
    'branch',
    target_branch_id,
    'SUCCESS'
  );

  return target_branch_id;
end;
$$;

revoke all on function public.update_branch(uuid, text, text, text, text, text, text, text, text, text, boolean)
from public, anon, authenticated, service_role;

comment on function public.update_branch(uuid, text, text, text, text, text, text, text, text, text, boolean) is
  'Updates one branch''s business/contact/address fields under current-user branch.manage + AAL2 and audits atomically. Cannot edit an archived branch.';

create or replace function public.archive_branch(
  target_branch_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := (select auth.uid());
  target_organization_id uuid;
  current_status text;
  remaining_non_archived_branches integer;
begin
  perform private.require_aal2();

  select branch.organization_id
  into target_organization_id
  from public.branches as branch
  where branch.id = target_branch_id;

  if not found then
    raise insufficient_privilege using message = 'not authorized to archive branch';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text, 0)
  );

  select branch.status
  into current_status
  from public.branches as branch
  where branch.id = target_branch_id
    and branch.organization_id = target_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized to archive branch';
  end if;

  if actor_user_id is null
     or not (select private.has_org_permission(
       target_organization_id,
       'branch.manage'
     )) then
    raise insufficient_privilege using message = 'not authorized to archive branch';
  end if;

  if current_status = 'archived' then
    raise invalid_parameter_value using message = 'branch is already archived';
  end if;

  select count(*)
  into remaining_non_archived_branches
  from public.branches as branch
  where branch.organization_id = target_organization_id
    and branch.status <> 'archived'
    and branch.id <> target_branch_id;

  if remaining_non_archived_branches = 0 then
    raise invalid_parameter_value using message = 'cannot archive the organization''s only remaining branch';
  end if;

  update public.branches
  set status = 'archived',
      archived_at = pg_catalog.statement_timestamp()
  where id = target_branch_id;

  insert into public.audit_events (
    organization_id,
    branch_id,
    actor_user_id,
    actor_type,
    category,
    action,
    entity_type,
    entity_id,
    result
  ) values (
    target_organization_id,
    target_branch_id,
    actor_user_id,
    'USER',
    'ADMINISTRATION',
    'branch.archived',
    'branch',
    target_branch_id,
    'SUCCESS'
  );

  return target_branch_id;
end;
$$;

revoke all on function public.archive_branch(uuid)
from public, anon, authenticated, service_role;

comment on function public.archive_branch(uuid) is
  'Archives one branch under current-user branch.manage + AAL2, refusing to leave the organization with zero non-archived branches, and audits atomically.';

grant execute on function public.update_branch(uuid, text, text, text, text, text, text, text, text, text, boolean)
  to authenticated;
grant execute on function public.archive_branch(uuid)
  to authenticated;
```

### Design notes

- **No client-supplied organization ID**, matching `create_branch` and
  `update_organization_member_status`: both RPCs derive `target_organization_id`
  by looking up `target_branch_id`'s row, never accept it as a parameter.
- **Not-found and not-authorized are the same message** (`'not authorized to
  update/archive branch'`) so a branch ID in another organization does not
  disclose its existence.
- **Row locked with `for update` after the advisory lock**, mirroring
  `update_organization_member_status` — re-checks status under lock so a
  concurrent archive can't race an update.
- **Distinct `invalid_parameter_value` (SQLSTATE `22023`) messages** for the
  three business-rule refusals, following the exact precedent in
  `update_organization_member_status` ("membership already matches requested
  state"). The TypeScript layer matches on the literal message text to map
  to distinct `BranchManagementError` codes — see below.
- **AAL2 required** for both, consistent with `create_branch` — branch
  update/archive is an equally privileged administrative action.

## `scripts/approved-final-grants.mjs` diff (apply alongside the migration)

Add a second registered terminal migration — do **not** touch the existing
`FINAL_GRANTS_MIGRATION` entry or its `finalGrants` array:

```js
const BRANCH_LIFECYCLE_MIGRATION = "<actual-filename>_branch_update_and_archive.sql";

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
    "The sole branch update/archive mutation path. Derives organization_id from the target branch row (never accepted from the client), calls private.require_aal2() first, takes the organization-scoped advisory lock, re-derives authorization from the current user context, and emits an audit event in the same transaction.",
}));

export const TERMINAL_MIGRATIONS = Object.freeze([
  Object.freeze({ file: FINAL_GRANTS_MIGRATION, grants: Object.freeze(finalGrants) }),
  Object.freeze({ file: BRANCH_LIFECYCLE_MIGRATION, grants: Object.freeze(branchLifecycleGrants) }),
]);
```

`lintMigrations` (`scripts/migration-privilege-lint.mjs`) already supports
multiple registered terminal migrations — `terminalByFile` is a `Map` and
`compareTerminalGrants` runs per-file — so this requires no lint code change,
only the registration above. Run `npm run security:migrations` after adding
the migration file to confirm.

## Why the TypeScript/UI layer was not written at design time (resolved)

`src/lib/supabase/server.ts`'s `createClient()` is typed
`createServerClient<Database>(...)` from `src/types/database.generated.ts`.
Calling `supabase.rpc("update_branch", ...)` before that function exists in
the generated types fails `npm run typecheck` — there is no way to write
this code today without either breaking typecheck or using an `any`/
`@ts-expect-error` escape hatch, which CLAUDE.md rules out for anything but
a documented third-party issue. Regenerate types (`npm run db:types`) against
a project that actually has the migration applied before writing this layer.

## Implementation spec used for the TypeScript/UI layer (now implemented)

When R6-F lifts the freeze and this migration is pushed to DEV and types are
regenerated:

### `src/lib/branches/schema.ts`

Add `branchUpdateFormSchema = branchFormSchema.omit({ code: true, slug: true })`.
Code and slug stay immutable; every other field (name, phone, email, address
fields, timezone, websiteVisible) is editable.

### `src/lib/branches/index.ts`

Extend `BranchManagementError`'s code union with `"ARCHIVED"`,
`"ALREADY_ARCHIVED"`, `"LAST_BRANCH"` alongside the existing `"DUPLICATE"`,
`"NOT_AUTHORIZED"`, `"FAILED"`.

Add `updateBranch({ branchId, ...fields })` calling `.rpc("update_branch",
{ target_branch_id: branchId, branch_name: ..., ... })`, mapping errors:
`42501` → `NOT_AUTHORIZED`; `22023` with message containing `"archived
branch"` → `ARCHIVED`; else `FAILED`.

Add `archiveBranch(branchId)` calling `.rpc("archive_branch", {
target_branch_id: branchId })`, mapping: `42501` → `NOT_AUTHORIZED`; `22023`
with message containing `"already archived"` → `ALREADY_ARCHIVED`; `22023`
with message containing `"only remaining branch"` → `LAST_BRANCH`; else
`FAILED`.

### `src/app/(emr)/settings/branches/actions.ts`

`updateBranchAction`/`archiveBranchAction` server actions, same shape as
`createBranchAction`: `requireAal2("/settings/branches")` first, then
`requirePermission({ permission: "branch.manage" })`, then the mutation, then
`revalidatePath("/settings/branches")`. Map each `BranchManagementError` code
to a specific, non-disclosing user-facing message (e.g. `LAST_BRANCH` →
"This is the organization's only remaining branch and cannot be archived.").

### UI (`branch-list.tsx`, `branch-form.tsx`)

- Add an "Edit" action per branch row opening `BranchForm` in edit mode
  (prefilled, code/slug rendered read-only, submitting `updateBranchAction`).
- Add an "Archive" action per row with a confirmation step (e.g. shadcn
  `AlertDialog`) before calling `archiveBranchAction`; hide/disable it for
  rows already `status === "archived"`.
- Keep the existing responsive table/card layout; add actions as a trailing
  column (desktop table) / row of buttons (mobile card), consistent with
  "no hover-only critical interaction" and 44px touch targets on
  coarse-pointer devices per `FRONTEND_ARCHITECTURE.md`.

### Tests to add at implementation time

- `schema.test.ts`: `branchUpdateFormSchema` accepts a full valid payload
  without `code`/`slug`.
- `actions.test.ts`: mirror `createBranchAction`'s five cases (AAL2 gate
  first, RBAC before mutation, field validation before permission lookup,
  forged/absent branch ownership rejected server-side, each
  `BranchManagementError` code mapped to its specific message) for both new
  actions.
- pgTAP (new suite or extend an existing branch suite under
  `supabase/tests/`): update succeeds for an org-authorized actor; update
  denied cross-organization; update denied on an already-archived branch;
  archive succeeds and sets `archived_at`; archive denied on an
  already-archived branch; archive denied when it is the organization's only
  non-archived branch; audit events recorded for both actions.
- Playwright: extend the existing branch E2E coverage with an edit round-trip
  and an archive-then-selector-no-longer-offers-it check.
