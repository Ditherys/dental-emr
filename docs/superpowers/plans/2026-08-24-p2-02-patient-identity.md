# P2-02 Patient Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the fail-closed organization-owned patient identity root, its tenant-safe audit linkage, and independently testable shared-patient RLS boundary.

**Architecture:** Two ordered migrations preserve grant-last. The object migration creates private normalization/validation/authorization helpers, `public.patients`, constraints, indexes, one read policy, and `audit_events.patient_id` while revoking every new privilege; the terminal migration grants only `authenticated` execution of the private RLS helper. No patient table or public patient RPC becomes browser- or service-role-accessible.

**Tech Stack:** PostgreSQL 17 on designated Supabase Cloud TEST, Supabase CLI 2.113.0, pgTAP, Node.js 22+, TypeScript 5, Vitest.

## Global Constraints

- Work only in P2-02. Do not add contacts, relationships, patient writes, duplicate workflow, search/detail RPCs, routes, UI, clinical data, merge, or hard delete.
- Git migrations are authoritative. Do not use a local Supabase/Docker stack and do not leave schema changes as direct remote SQL side effects.
- Use only the designated synthetic Cloud TEST project; verify it differs from DEV before any remote write.
- Never place patient PII or credentials in fixtures, comments, errors, logs, audit metadata, or commits.
- `patients` remains organization-owned; preferred branch and acting branch never become tenant ownership.
- `PUBLIC`, `anon`, `authenticated`, and `service_role` retain no patient-table privilege.
- The only new final privilege is `EXECUTE` for `authenticated` on `private.has_shared_patient_permission(uuid, text)`; `private` schema usage remains revoked.
- Every function sets `search_path = ''`, schema-qualifies relations, and receives an adjacent four-role revoke in the object migration.
- Name plus birth date is not unique. Duplicate warning, matching, and merge remain deferred.
- P2-03 remains blocked until P2-02 passes guarded Cloud TEST and independent migration/RLS review.

## File map

- Create `supabase/tests/patient_identity.test.sql`: rollback-bounded pgTAP schema, normalization, constraint, privilege, RLS, and tenant-FK matrix.
- Modify `scripts/remote-database-test-guard.mjs`: register `patient_identity.test.sql` immediately after `patient_authorization.test.sql`.
- Create `supabase/migrations/20260824010000_patient_identity.sql`: fail-closed objects, table, policy, and audit linkage; contains no `GRANT`.
- Create `supabase/migrations/20260824010100_patient_identity_grants.sql`: exact terminal helper grant only.
- Modify `scripts/approved-final-grants.mjs`: register the terminal migration and its one approved grant with rationale.
- Modify `src/types/database.generated.ts`: generated output only after Cloud TEST migration application.
- Modify `docs/AI_HANDOFF.md`: implementation checkpoint, evidence, and residual risks for independent review.

---

## Execution preflight

Before writing the failing suite, include this plan/correction commit in the
accepted P2-01 PR, merge that PR only after its required checks remain green,
fetch `origin/main`, and create `feat/p2-02-patient-identity` from that accepted
main SHA in an isolated worktree. Verify `git status --short` is empty and record
the base SHA. Do not stack P2-02 implementation commits on an unmerged P2-01
head, and do not apply P2-02 migrations to Cloud TEST before the red pgTAP run.

---

### Task 1: Write and register the failing patient-identity contract

**Files:**
- Create: `supabase/tests/patient_identity.test.sql`
- Modify: `scripts/remote-database-test-guard.mjs:68`
- Test: `scripts/remote-database-test-guard.test.mjs:226`

**Interfaces:**
- Consumes: existing global system roles and P2-01 permission codes `patient.demographics.read` and `patient.demographics.write`.
- Produces: one rollback-bounded suite named `patient_identity.test.sql`; no production object yet.

- [ ] **Step 1: Register the suite before authoring implementation SQL**

Add the exact entry after the P2-01 authorization suite:

```js
export const DATABASE_TEST_SUITES = Object.freeze([
  "schema.test.sql",
  "foundation_rls.test.sql",
  "workforce_invitations.test.sql",
  "patient_authorization.test.sql",
  "patient_identity.test.sql",
  "audit_foundation.test.sql",
  "session_authorization_boundaries.test.sql",
  "seed_security_fixtures.test.sql",
  "branch_lifecycle.test.sql",
]);
```

- [ ] **Step 2: Create the rollback-bounded pgTAP suite with synthetic fixtures**

Start the file with this structure and keep all fixture UUIDs in the `a2...` namespace so they cannot collide with existing suites:

```sql
begin;

select extensions.no_plan();

-- Actors: Org A owner, dentist, branch receptionist, visiting specialist,
-- suspended dentist; Org B receptionist. All addresses are reserved synthetic
-- `.example.test` values and the transaction rolls back.
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  actor.id,
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  actor.email,
  '',
  statement_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  statement_timestamp(),
  statement_timestamp()
from (values
  ('a2010000-0000-0000-0000-000000000001'::uuid, 'owner-a@p202.example.test'),
  ('a2010000-0000-0000-0000-000000000002'::uuid, 'dentist-a@p202.example.test'),
  ('a2010000-0000-0000-0000-000000000003'::uuid, 'reception-a@p202.example.test'),
  ('a2010000-0000-0000-0000-000000000004'::uuid, 'visitor-a@p202.example.test'),
  ('a2010000-0000-0000-0000-000000000005'::uuid, 'suspended-a@p202.example.test'),
  ('a2010000-0000-0000-0000-000000000006'::uuid, 'reception-b@p202.example.test')
) as actor(id, email);

insert into public.organizations (id, legal_name, business_name, slug)
values
  ('a2020000-0000-0000-0000-000000000001', 'P202 Synthetic A Inc.', 'P202 Synthetic A', 'p202-synthetic-a'),
  ('a2020000-0000-0000-0000-000000000002', 'P202 Synthetic B Inc.', 'P202 Synthetic B', 'p202-synthetic-b');

insert into public.branches (
  id, organization_id, name, slug, code, address_line1, city, province
)
values
  ('a2030000-0000-0000-0000-000000000001', 'a2020000-0000-0000-0000-000000000001', 'P202 A Main', 'p202-a-main', 'P202-A1', '1 Synthetic Street', 'Test City', 'Test Province'),
  ('a2030000-0000-0000-0000-000000000002', 'a2020000-0000-0000-0000-000000000001', 'P202 A Other', 'p202-a-other', 'P202-A2', '2 Synthetic Street', 'Test City', 'Test Province'),
  ('a2030000-0000-0000-0000-000000000003', 'a2020000-0000-0000-0000-000000000002', 'P202 B Main', 'p202-b-main', 'P202-B1', '3 Synthetic Street', 'Test City', 'Test Province');
```

Continue the fixture with six `organization_members` rows using IDs
`a204...001` through `a204...006`. Set the fifth actor to `suspended` and all
others to `active`. Add active `branch_memberships` for the two receptionist
actors at `a203...001` and `a203...003`. Assign global roles with these exact
scopes:

| Actor | Role | Scope |
|---|---|---|
| Org A owner | `OWNER` | organization |
| Org A dentist | `DENTIST` | organization |
| Org A receptionist | `RECEPTIONIST` | branch `a203...001` |
| Org A visitor | `VISITING_SPECIALIST` | organization |
| Org A suspended actor | `DENTIST` | organization |
| Org B receptionist | `RECEPTIONIST` | branch `a203...003` |

Insert three synthetic patient rows as the migration owner before switching
roles: two Org A namesakes with the same birth date and one Org B patient. Use
patient IDs `a205...001` through `a205...003`, patient numbers `P202-A-0001`,
`P202-A-0002`, and `P202-B-0001`, and preferred branches from the matching
organization only.

- [ ] **Step 3: Add exact schema, invariant, and normalization assertions**

Use pgTAP/catalog assertions for all of the following, with one assertion per
row so failures name the violated contract:

```sql
select extensions.ok(to_regclass('public.patients') is not null, 'patients exists');
select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.patients'::regclass),
  'patients has RLS enabled'
);
select extensions.is(
  private.normalize_patient_name('  MARÍA—De   León  '),
  'maría de león',
  'normalization applies NFKC/lowercase and collapses punctuation/space runs'
);
select extensions.is(
  (select count(*)::integer from public.patients
   where organization_id = 'a2020000-0000-0000-0000-000000000001'
     and normalized_first_name = private.normalize_patient_name('Ana')
     and normalized_last_name = private.normalize_patient_name('Santos')
     and birth_date = date '1990-01-01'),
  2,
  'name plus birth date is deliberately not unique'
);
select extensions.ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'patients_organization_normalized_name_birth_date_idx'
  ),
  'normalized tenant name/birth-date index exists'
);
```

Also assert the unique `(organization_id, id)` and `(organization_id,
patient_number)` constraints, preferred-branch composite FK, audit-patient
composite FK, tenant birth-date index, audit patient/time index, four generated
normalized columns, positive version, archive/status equivalence, bounds, sex
allowlist, and timestamp trigger.

- [ ] **Step 4: Add negative constraint and tenant-link assertions**

Use `extensions.throws_ok` with constraint names, not full patient values, for:

```sql
select extensions.throws_ok(
  $$insert into public.patients (
      organization_id, patient_number, first_name, last_name, birth_date
    ) values (
      'a2020000-0000-0000-0000-000000000001',
      'P202-FUTURE', 'Future', 'Synthetic', current_date + 1
    )$$,
  '22023',
  'invalid patient birth date',
  'future birth dates fail closed without echoing PII'
);

select extensions.throws_ok(
  $$insert into public.patients (
      organization_id, patient_number, first_name, last_name, birth_date,
      preferred_branch_id
    ) values (
      'a2020000-0000-0000-0000-000000000001',
      'P202-CROSS-BRANCH', 'Cross', 'Tenant', date '2000-01-01',
      'a2030000-0000-0000-0000-000000000003'
    )$$,
  '23503',
  null,
  'patient cannot reference another organization preferred branch'
);

select extensions.throws_ok(
  $$insert into public.audit_events (
      organization_id, actor_type, category, action, entity_type, result,
      patient_id
    ) values (
      'a2020000-0000-0000-0000-000000000001', 'SYSTEM', 'PATIENT',
      'patient.tested', 'patient', 'SUCCESS',
      'a2050000-0000-0000-0000-000000000003'
    )$$,
  '23503',
  null,
  'audit event cannot link to another organization patient'
);
```

Add equivalent assertions for blank/overlong text, date before 1900, invalid
sex, zero version, invalid archive/status combinations, duplicate patient
number in one tenant, and allowed reuse of that patient number in another
tenant.

- [ ] **Step 5: Add committed privilege probes before any test-only grant**

```sql
select extensions.ok(
  not has_table_privilege('PUBLIC', 'public.patients', 'SELECT')
  and not has_table_privilege('anon', 'public.patients', 'SELECT')
  and not has_table_privilege('authenticated', 'public.patients', 'SELECT')
  and not has_table_privilege('service_role', 'public.patients', 'SELECT'),
  'no public, browser, or service role has direct patient SELECT'
);

select extensions.ok(
  not has_table_privilege('authenticated', 'public.patients', 'INSERT')
  and not has_table_privilege('authenticated', 'public.patients', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.patients', 'DELETE')
  and not has_table_privilege('service_role', 'public.patients', 'INSERT')
  and not has_table_privilege('service_role', 'public.patients', 'UPDATE')
  and not has_table_privilege('service_role', 'public.patients', 'DELETE'),
  'direct patient DML remains ungranted'
);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'private.has_shared_patient_permission(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'private.has_shared_patient_permission(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'private.has_shared_patient_permission(uuid,text)',
    'EXECUTE'
  ),
  'only authenticated may execute the private RLS helper'
);
```

Switch to `authenticated` before the temporary `SELECT` grant and prove direct
`SELECT`, `INSERT`, `UPDATE`, and `DELETE` each fail with SQLSTATE `42501`.

- [ ] **Step 6: Add the independent RLS behavior matrix inside the transaction**

As the migration owner, execute `grant select on public.patients to
authenticated;` only after the committed privilege assertions. Then use `set
local role authenticated`, `set_config('request.jwt.claim.sub', actor_uuid,
true)`, and `set_config('request.jwt.claim.role', 'authenticated', true)` for
each actor. Assert these exact row counts:

| Actor context | Org A rows | Org B rows | Reason |
|---|---:|---:|---|
| Org A organization dentist | 2 | 0 | org-wide patient read |
| Org A branch receptionist | 2 | 0 | branch-scoped patient permission opens shared Org A directory |
| Org A owner | 0 | 0 | administrative ownership is not patient access |
| Org A visiting specialist | 0 | 0 | assigned-case access is not implemented |
| Org A suspended dentist | 0 | 0 | suspension is live and fail-closed |
| Org B branch receptionist | 0 | 1 | reverse tenant isolation |
| absent/forged user UUID | 0 | 0 | JWT subject alone is not membership |

Revoke the receptionist's branch membership inside the transaction and assert
its next statement sees zero rows. Restore the membership, archive its branch,
and assert the next statement also sees zero rows. Reset the role before fixture
cleanup. The enclosing rollback must remove the test-only grant and every row.

- [ ] **Step 7: Finish the suite and verify the red state**

End with the runner-compatible sentinel:

```sql
reset role;

select case
  when count(*) = 0 then 'P1_TEST_PASS'
  else 'P1_TEST_FAIL'
end as p1_test_result
from extensions.finish();

rollback;
```

Run locally:

```powershell
npm run test:unit -- scripts/remote-database-test-guard.test.mjs
```

Expected: PASS, proving the new suite is registered and rollback-bounded.

Run against the already-guarded Cloud TEST project without applying a migration:

```powershell
npm run test:db
```

Expected: FAIL only when `patient_identity.test.sql` reaches the missing
`public.patients`/helper contract. Preserve this red output without including
credentials or fixture values in logs. Do not commit yet.

---

### Task 2: Implement the fail-closed patient identity migration pair

**Files:**
- Create: `supabase/migrations/20260824010000_patient_identity.sql`
- Create: `supabase/migrations/20260824010100_patient_identity_grants.sql`
- Modify: `scripts/approved-final-grants.mjs:149`
- Test: `supabase/tests/patient_identity.test.sql`

**Interfaces:**
- Consumes: `private.set_updated_at()`, `auth.uid()`, foundation membership/role tables, P2-01 permission catalog, composite `branches(organization_id,id)`.
- Produces: `private.normalize_patient_name(text) -> text`, `private.validate_patient_birth_date() -> trigger`, `private.has_shared_patient_permission(uuid,text) -> boolean`, `public.patients`, `audit_events.patient_id`, and one authenticated helper-execution grant.

- [ ] **Step 1: Create the normalization and birth-date helpers with adjacent revokes**

```sql
-- P2-02: organization-owned patient identity root, fail-closed RLS, and
-- tenant-safe audit linkage. This object migration grants nothing.

create or replace function private.normalize_patient_name(candidate text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    pg_catalog.btrim(
      pg_catalog.regexp_replace(
        pg_catalog.lower(normalize(candidate, NFKC)),
        '[^[:alnum:]]+',
        ' ',
        'g'
      )
    ),
    ''
  )
$$;

revoke all on function private.normalize_patient_name(text)
from public, anon, authenticated, service_role;

create or replace function private.validate_patient_birth_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date > current_date then
    raise invalid_parameter_value using message = 'invalid patient birth date';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_patient_birth_date()
from public, anon, authenticated, service_role;
```

- [ ] **Step 2: Create the shared-patient authorization helper**

Use the exact permission allowlist so this helper cannot silently become a
generic branch-authorization primitive:

```sql
create or replace function private.has_shared_patient_permission(
  target_organization_id uuid,
  target_permission_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_permission_code in (
    'patient.demographics.read',
    'patient.demographics.write'
  ) and exists (
    select 1
    from public.organization_members as organization_member
    join public.organizations as organization
      on organization.id = organization_member.organization_id
     and organization.status = 'active'
    join public.member_roles as member_role
      on member_role.organization_id = organization_member.organization_id
     and member_role.organization_member_id = organization_member.id
    join public.roles as role
      on role.id = member_role.role_id
     and (
       role.organization_id is null
       or role.organization_id = organization_member.organization_id
     )
    join public.role_permissions as role_permission
      on role_permission.role_id = role.id
    join public.permissions as permission
      on permission.id = role_permission.permission_id
     and permission.code = target_permission_code
    where organization_member.organization_id = target_organization_id
      and organization_member.user_id = (select auth.uid())
      and organization_member.membership_status = 'active'
      and (
        member_role.branch_id is null
        or exists (
          select 1
          from public.branches as branch
          join public.branch_memberships as branch_membership
            on branch_membership.organization_id = branch.organization_id
           and branch_membership.branch_id = branch.id
           and branch_membership.organization_member_id = organization_member.id
          where branch.organization_id = target_organization_id
            and branch.id = member_role.branch_id
            and branch.status = 'active'
            and branch_membership.access_status = 'active'
        )
      )
  )
$$;

revoke all on function private.has_shared_patient_permission(uuid, text)
from public, anon, authenticated, service_role;
```

- [ ] **Step 3: Create `public.patients` with bounded identity fields and generated normalization**

```sql
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_number text not null check (
    pg_catalog.btrim(patient_number) <> ''
    and pg_catalog.length(patient_number) <= 64
  ),
  first_name text not null check (
    pg_catalog.btrim(first_name) <> '' and pg_catalog.length(first_name) <= 120
  ),
  middle_name text check (
    middle_name is null or (
      pg_catalog.btrim(middle_name) <> '' and pg_catalog.length(middle_name) <= 120
    )
  ),
  last_name text not null check (
    pg_catalog.btrim(last_name) <> '' and pg_catalog.length(last_name) <= 120
  ),
  suffix text check (
    suffix is null or (
      pg_catalog.btrim(suffix) <> '' and pg_catalog.length(suffix) <= 40
    )
  ),
  preferred_name text check (
    preferred_name is null or (
      pg_catalog.btrim(preferred_name) <> '' and pg_catalog.length(preferred_name) <= 120
    )
  ),
  birth_date date not null check (birth_date >= date '1900-01-01'),
  sex_at_registration text check (
    sex_at_registration is null or sex_at_registration in (
      'female', 'male', 'intersex', 'unknown', 'not_recorded'
    )
  ),
  address_line1 text check (
    address_line1 is null or (
      pg_catalog.btrim(address_line1) <> '' and pg_catalog.length(address_line1) <= 160
    )
  ),
  address_line2 text check (
    address_line2 is null or (
      pg_catalog.btrim(address_line2) <> '' and pg_catalog.length(address_line2) <= 160
    )
  ),
  city text check (
    city is null or (pg_catalog.btrim(city) <> '' and pg_catalog.length(city) <= 100)
  ),
  province text check (
    province is null or (
      pg_catalog.btrim(province) <> '' and pg_catalog.length(province) <= 100
    )
  ),
  postal_code text check (
    postal_code is null or (
      pg_catalog.btrim(postal_code) <> '' and pg_catalog.length(postal_code) <= 20
    )
  ),
  preferred_branch_id uuid,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  version integer not null default 1 check (version > 0),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  normalized_first_name text generated always as (
    private.normalize_patient_name(first_name)
  ) stored,
  normalized_middle_name text generated always as (
    private.normalize_patient_name(middle_name)
  ) stored,
  normalized_last_name text generated always as (
    private.normalize_patient_name(last_name)
  ) stored,
  normalized_full_name text generated always as (
    private.normalize_patient_name(
      first_name
      || case when middle_name is null then '' else ' ' || middle_name end
      || ' ' || last_name
      || case when suffix is null then '' else ' ' || suffix end
    )
  ) stored,
  constraint patients_organization_id_id_key unique (organization_id, id),
  constraint patients_organization_patient_number_key unique (
    organization_id, patient_number
  ),
  constraint patients_organization_preferred_branch_fk foreign key (
    organization_id, preferred_branch_id
  ) references public.branches(organization_id, id) on delete restrict,
  constraint patients_archive_state_check check (
    (status = 'archived') = (archived_at is not null)
  )
);

revoke all on table public.patients
from public, anon, authenticated, service_role;

alter table public.patients enable row level security;
```

- [ ] **Step 4: Add triggers, indexes, and the read-only policy**

```sql
create trigger patients_validate_birth_date
before insert or update of birth_date on public.patients
for each row execute function private.validate_patient_birth_date();

create trigger patients_set_updated_at
before update on public.patients
for each row execute function private.set_updated_at();

create index patients_organization_birth_date_idx
  on public.patients (organization_id, birth_date);

create index patients_organization_normalized_name_birth_date_idx
  on public.patients (
    organization_id,
    normalized_last_name,
    normalized_first_name,
    birth_date
  );

create policy patients_select_shared_directory
on public.patients
for select
to authenticated
using ((select private.has_shared_patient_permission(
  organization_id,
  'patient.demographics.read'
)));
```

Do not create INSERT, UPDATE, DELETE, `ALL`, anon, owner, administrator, or
service-role policies.

- [ ] **Step 5: Add the tenant-safe audit linkage without widening metadata**

```sql
alter table public.audit_events
  add column patient_id uuid,
  add constraint audit_events_organization_patient_fk foreign key (
    organization_id,
    patient_id
  ) references public.patients(organization_id, id) on delete restrict;

create index audit_events_organization_patient_occurred_at_idx
  on public.audit_events (organization_id, patient_id, occurred_at desc)
  where patient_id is not null;
```

Do not edit `private.audit_metadata_is_safe(jsonb)` or add patient identity keys
to its allowlist. Do not revoke or re-grant `audit_events`: adding a column and
foreign key creates no new table ACL, and the accepted Phase 1 RLS-filtered
`authenticated SELECT` privilege must remain unchanged.

- [ ] **Step 6: Create and register the exact grant-terminal migration**

`supabase/migrations/20260824010100_patient_identity_grants.sql` contains only:

```sql
-- P2-02 grant terminal. Required only to evaluate the stored patient RLS
-- expression. The private schema remains unavailable through the Data API.

grant execute on function private.has_shared_patient_permission(uuid, text)
to authenticated;
```

Add this exact terminal to `scripts/approved-final-grants.mjs` after the P2-01
terminal:

```js
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

// Append inside TERMINAL_MIGRATIONS:
Object.freeze({
  file: PATIENT_IDENTITY_GRANTS_MIGRATION,
  grants: patientIdentityGrants,
}),
```

- [ ] **Step 7: Run offline migration and unit gates**

```powershell
npm run security:migrations
npm run test:unit -- scripts/remote-database-test-guard.test.mjs scripts/migration-privilege-lint.test.mjs scripts/boundary-privilege-invariant.test.mjs
git diff --check
```

Expected: all commands pass; migration lint reports 13 migrations and four
registered terminal migrations, the new suite is registered, and the object
migration contains no grant.

- [ ] **Step 8: Apply once to guarded Cloud TEST and verify green**

Confirm the linked target first without printing credentials:

```powershell
npm run ci:test-target
npm run db:push:dry
npm run db:push:test
npm run db:provision:test
npm run test:db
npm run db:lint:test
npm run db:advisors:test
```

Expected: only the two P2-02 migrations are pending in the preview; both apply;
all pgTAP suites return the runner sentinel; schema lint and security advisors
pass. If the preview names any unexpected migration, stop without applying.

- [ ] **Step 9: Commit the green database slice**

```powershell
git add -- supabase/tests/patient_identity.test.sql scripts/remote-database-test-guard.mjs supabase/migrations/20260824010000_patient_identity.sql supabase/migrations/20260824010100_patient_identity_grants.sql scripts/approved-final-grants.mjs
git commit -m "feat: add fail-closed patient identity schema"
```

---

### Task 3: Regenerate database types and close the implementation checkpoint

**Files:**
- Modify: `src/types/database.generated.ts`
- Modify: `docs/AI_HANDOFF.md`
- Test: complete application and guarded Cloud TEST verification

**Interfaces:**
- Consumes: Cloud TEST schema after both P2-02 migrations.
- Produces: generated `patients` row/insert/update relationship types and nullable `audit_events.patient_id`; reviewer-ready checkpoint.

- [ ] **Step 1: Regenerate types from the designated migrated TEST project**

```powershell
npm run db:types
npm run db:types:check:test
```

Expected generated changes:

- `Database["public"]["Tables"]["patients"]` contains every migration column;
- generated columns are present in `Row`, optional/absent from writable inserts
  according to Supabase generation semantics;
- `audit_events.Row.patient_id` is `string | null` and its Insert/Update forms
  are optional nullable;
- relationships include `patients_organization_preferred_branch_fk`,
  `patients_organization_id_fkey`, and
  `audit_events_organization_patient_fk` as generated by the CLI.

Do not hand-edit generated declarations.

- [ ] **Step 2: Run the complete local application gate**

```powershell
npm run verify
git diff --check
git status --short
```

Expected: migration lint, ESLint, strict typecheck, unit tests, production build,
secret scan, and high-severity dependency audit pass. Status contains only the
generated type file and intended handoff update after the database commit.

- [ ] **Step 3: Update the handoff with verifiable facts only**

Replace the current checkpoint paragraph with:

```markdown
**P2-02 is implemented and waiting for independent migration/RLS review.** The
checkpoint adds the organization-owned `patients` root, bounded database-owned
normalization, tenant-safe preferred-branch and audit links, fail-closed RLS,
and no patient-table grants. Its sole new browser-role privilege is execution of
the private RLS helper required to evaluate the stored policy; private schema
usage remains revoked.
```

Add the exact commit SHA and hosted run URL only after they exist. Record test
counts from fresh output, state that all data is synthetic, and explicitly say
P2-03 remains blocked.

- [ ] **Step 4: Commit generated types and handoff**

```powershell
git add -- src/types/database.generated.ts docs/AI_HANDOFF.md
git commit -m "docs: record P2-02 verification checkpoint"
```

- [ ] **Step 5: Push the P2-02 branch and run required GitHub checks**

Push to a dedicated `feat/p2-02-patient-identity` branch/PR based on accepted
main. Use the repository's exact `cloud-test` environment branch policy; if the
policy allows only `main`, add only the exact PR merge ref temporarily, remove
it immediately after the run, and verify the final policy again.

Required successful checks:

- Application verification;
- Cloud TEST database and E2E;
- CodeQL;
- dependency review.

Cloud TEST must independently apply/reconcile the two migrations, run all pgTAP
suites including `patient_identity.test.sql`, check generated types, schema
lint, hosted Auth posture, security advisors, and Playwright. A documentation-
only follow-up does not require another Cloud TEST run unless it changes CI,
migration registration, generated types, or database/security behavior.

- [ ] **Step 6: Request independent migration/RLS review and stop**

Give the reviewer the base/main SHA, head SHA, P2-02 plan section, approved
design, both migrations, grant allowlist change, pgTAP suite, generated types,
and CI URL. Require findings by Critical/High/Medium/Low and an explicit
ready-to-merge verdict. The reviewer must attempt cross-tenant preferred-branch
and audit links, owner/visitor/service over-access, forged JWT tenant/branch,
branch revocation, unsafe `SECURITY DEFINER`, missing search-path qualification,
and migration-boundary privilege exposure.

Do not merge or begin P2-03 until findings are resolved, all required checks are
green, and the owner records acceptance.
