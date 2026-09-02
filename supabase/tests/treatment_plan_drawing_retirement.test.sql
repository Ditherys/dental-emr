-- Task 16: the retired treatment-plan drawing canvas.
--
-- The migration 20260901010500 emptied public.treatment_plan_drawings after a
-- fail-closed preflight and sealed it as a compatibility tombstone;
-- 20260901010501 revoked the one browser-reachable writer.
--
-- The ORDERING guarantee - that the preflight aborts before anything is
-- deleted - is proved statically in
-- scripts/treatment-plan-drawing-retirement-migration.test.mjs, because it is a
-- property of the migration text rather than of the resulting state. This suite
-- proves the resulting STATE: empty, non-writable, ungranted, and - the half
-- that matters clinically - that structured treatment-plan history is untouched.
--
-- Placed before supabase/tests/treatment_plans.test.sql in DATABASE_TEST_SUITES,
-- because the local gate halts there.

begin;

select extensions.no_plan();

-- --------------------------------------------------------------------------
-- The tombstone is empty.
-- --------------------------------------------------------------------------

select extensions.is(
  (select count(*)::integer from public.treatment_plan_drawings),
  0,
  'the retired treatment_plan_drawings table holds no row'
);

select extensions.ok(
  to_regclass('public.treatment_plan_drawings') is not null,
  'the retired table is left in place as a compatibility tombstone rather than dropped'
);

-- --------------------------------------------------------------------------
-- The tombstone is non-writable, by anyone, including its owner.
-- --------------------------------------------------------------------------

select extensions.is(
  (select count(*)::integer
   from pg_trigger
   where tgrelid = 'public.treatment_plan_drawings'::regclass
     and not tgisinternal
     and tgname in (
       'treatment_plan_drawings_retired_row_guard',
       'treatment_plan_drawings_retired_truncate_guard'
     )),
  2,
  'both retirement guards are installed on the tombstone'
);

-- A synthetic parent plan, inserted as the owner: the schema is deny-by-default
-- with zero base grants, so this is the only way to reach a valid composite FK.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b7a00000-0000-0000-0000-000000000001','T16 Synthetic Inc.','T16 Synthetic','t16-synthetic');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b7a10000-0000-0000-0000-000000000001','b7a00000-0000-0000-0000-000000000001','T16 Main','t16-main','T16','1 Synthetic St','Test City','Test Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b7a20000-0000-0000-0000-000000000001','b7a00000-0000-0000-0000-000000000001','T16-1','Patient','T16',date '1990-01-01','b7a10000-0000-0000-0000-000000000001');
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status) values
  ('b7a30000-0000-0000-0000-000000000001','b7a00000-0000-0000-0000-000000000001','Dentist','T16','REGULAR','active');
insert into public.procedures (id, organization_id, code, name, status) values
  ('b7a40000-0000-0000-0000-000000000001','b7a00000-0000-0000-0000-000000000001','T16_PROC','Synthetic Procedure T16','active');
insert into public.treatment_plans (id, organization_id, patient_id, title) values
  ('b7a50000-0000-0000-0000-000000000001','b7a00000-0000-0000-0000-000000000001','b7a20000-0000-0000-0000-000000000001','T16 structured plan');

select extensions.throws_ok(
  $$insert into public.treatment_plan_drawings (organization_id, plan_id, drawing, updated_by)
    values ('b7a00000-0000-0000-0000-000000000001','b7a50000-0000-0000-0000-000000000001','{}'::jsonb,null)$$,
  '42501',
  'treatment plan drawings are retired',
  'the tombstone refuses an INSERT even from the owning role'
);

-- UPDATE and DELETE cannot be exercised behaviourally: the table is empty and,
-- because INSERT is refused, it can never hold a row again - which is the whole
-- point. Their refusal is therefore asserted on the trigger definition itself.
-- tgtype 31 = BEFORE(2) | ROW(1) | INSERT(4) | DELETE(8) | UPDATE(16);
-- tgtype 34 = BEFORE(2) | STATEMENT | TRUNCATE(32).
select extensions.is(
  (select tgtype::integer
   from pg_trigger
   where tgrelid = 'public.treatment_plan_drawings'::regclass
     and tgname = 'treatment_plan_drawings_retired_row_guard'),
  31,
  'the row guard fires BEFORE every INSERT, UPDATE and DELETE'
);

select extensions.is(
  (select tgtype::integer
   from pg_trigger
   where tgrelid = 'public.treatment_plan_drawings'::regclass
     and tgname = 'treatment_plan_drawings_retired_truncate_guard'),
  34,
  'the truncate guard fires BEFORE TRUNCATE, which a row-level guard would miss'
);

select extensions.is(
  (select count(*)::integer
   from pg_trigger
   where tgrelid = 'public.treatment_plan_drawings'::regclass
     and not tgisinternal
     and tgenabled <> 'O'),
  0,
  'neither retirement guard is disabled'
);

select extensions.throws_ok(
  $$truncate table public.treatment_plan_drawings$$,
  '42501',
  'treatment plan drawings are retired',
  'the tombstone refuses a TRUNCATE, which a row-level guard alone would miss'
);

-- --------------------------------------------------------------------------
-- No residual grant, on the table or on its writer.
-- --------------------------------------------------------------------------

select extensions.ok(
  not exists (
    select 1
    from (values
      (0::oid),
      ((select oid from pg_roles where rolname = 'anon')),
      ((select oid from pg_roles where rolname = 'authenticated')),
      ((select oid from pg_roles where rolname = 'service_role'))
    ) as role(role_oid)
    cross join (values
      ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')
    ) as privilege(name)
    where has_table_privilege(role.role_oid, 'public.treatment_plan_drawings', privilege.name)
  ),
  'PUBLIC, anon, authenticated, and service_role hold no privilege on the tombstone'
);

select extensions.is(
  (select count(*)::integer
   from pg_policies
   where schemaname = 'public' and tablename = 'treatment_plan_drawings'),
  0,
  'the tombstone still has no browser policy'
);

select extensions.ok(
  (select relrowsecurity from pg_class where oid = 'public.treatment_plan_drawings'::regclass),
  'the tombstone keeps RLS enabled'
);

select extensions.ok(
  not exists (
    select 1
    from (values
      ('public'),('anon'),('authenticated'),('service_role')
    ) as role(name)
    where has_function_privilege(
      role.name,
      'public.save_treatment_plan_drawing(uuid,uuid,integer,jsonb)',
      'EXECUTE'
    )
  ),
  'no browser-reachable role may execute save_treatment_plan_drawing any more'
);

select extensions.ok(
  not exists (
    select 1
    from (values
      ('public'),('anon'),('authenticated'),('service_role')
    ) as role(name)
    where has_function_privilege(
      role.name,
      'private.reject_treatment_plan_drawing_mutation()',
      'EXECUTE'
    )
  ),
  'the retirement guard function is revoked from every browser-reachable role'
);

select extensions.is(
  (select count(*)::integer
   from pg_proc
   where oid = 'private.reject_treatment_plan_drawing_mutation()'::regprocedure
     and proconfig = array['search_path=""']::text[]),
  1,
  'the retirement guard pins an empty search path'
);

-- --------------------------------------------------------------------------
-- No projection reads the tombstone any more.
-- --------------------------------------------------------------------------

select extensions.is(
  (select coalesce(
     pg_catalog.string_agg(proc.oid::regprocedure::text, ', ' order by proc.oid::regprocedure::text),
     '')
   from pg_proc as proc
   join pg_namespace as space on space.oid = proc.pronamespace
   where space.nspname in ('public', 'private')
     and proc.prokind = 'f'
     and strpos(proc.prosrc, 'treatment_plan_drawings') > 0
     and proc.oid <> 'public.save_treatment_plan_drawing(uuid,uuid,integer,jsonb)'::regprocedure),
  '',
  'only the revoked, trigger-blocked writer still names the retired table'
);

-- --------------------------------------------------------------------------
-- Structured treatment-plan history is intact. This is the half that matters:
-- retiring the ink must not have touched the record.
-- --------------------------------------------------------------------------

insert into public.treatment_plan_items (id, organization_id, plan_id, line_no, procedure_id, tooth_code, description, estimated_fee_centavos) values
  ('b7a60000-0000-0000-0000-000000000001','b7a00000-0000-0000-0000-000000000001','b7a50000-0000-0000-0000-000000000001',1,'b7a40000-0000-0000-0000-000000000001','16','Composite restoration',250000);
insert into public.treatment_plan_alternatives (id, organization_id, plan_id, alternative_no, summary) values
  ('b7a70000-0000-0000-0000-000000000001','b7a00000-0000-0000-0000-000000000001','b7a50000-0000-0000-0000-000000000001',1,'Extraction and bridge');
insert into public.treatment_plan_discussions (id, organization_id, plan_id, discussed_by, treating_provider_id, discussed_at, context, notes) values
  ('b7a80000-0000-0000-0000-000000000001','b7a00000-0000-0000-0000-000000000001','b7a50000-0000-0000-0000-000000000001',null,'b7a30000-0000-0000-0000-000000000001',timestamptz '2026-08-01 09:00:00+08','CHAIRSIDE','Options discussed');

select extensions.is(
  (select count(*)::integer from public.treatment_plans where id = 'b7a50000-0000-0000-0000-000000000001'),
  1,
  'the plan itself survives the retirement'
);
select extensions.is(
  (select count(*)::integer from public.treatment_plan_items where plan_id = 'b7a50000-0000-0000-0000-000000000001'),
  1,
  'plan items survive the retirement'
);
select extensions.is(
  (select count(*)::integer from public.treatment_plan_alternatives where plan_id = 'b7a50000-0000-0000-0000-000000000001'),
  1,
  'plan alternatives survive the retirement'
);
select extensions.is(
  (select count(*)::integer from public.treatment_plan_discussions where plan_id = 'b7a50000-0000-0000-0000-000000000001'),
  1,
  'plan discussions survive the retirement'
);

-- The projections still project the structured record; they simply no longer
-- read the tombstone.
select extensions.ok(
  pg_get_functiondef('public.get_treatment_plan_detail(uuid,uuid)'::regprocedure)
    like '%treatment\_plan\_items%'
  and pg_get_functiondef('public.get_treatment_plan_detail(uuid,uuid)'::regprocedure)
    like '%treatment\_plan\_alternatives%'
  and pg_get_functiondef('public.get_treatment_plan_detail(uuid,uuid)'::regprocedure)
    like '%treatment\_plan\_discussions%',
  'get_treatment_plan_detail still projects items, alternatives and discussions'
);

select extensions.ok(
  pg_get_functiondef('public.list_treatment_plans(uuid,uuid)'::regprocedure)
    like '%treatment\_plan\_items%',
  'list_treatment_plans still counts plan items'
);

select extensions.ok(
  pg_get_functiondef('public.generate_document(uuid,uuid,text,jsonb)'::regprocedure)
    like '%treatment\_plan\_items%',
  'generate_document still snapshots plan items'
);

-- The projection contract is unchanged in shape, so nothing that parses it
-- breaks: has_drawing is still returned, and is now constantly false.
select extensions.ok(
  (select 'has_drawing' = any(proargnames)
   from pg_proc
   where oid = 'public.list_treatment_plans(uuid,uuid)'::regprocedure),
  'list_treatment_plans keeps its has_drawing column so the parsed contract is unchanged'
);

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result
from test_failures;

rollback;
