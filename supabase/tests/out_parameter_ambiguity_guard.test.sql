-- OUT-parameter / column ambiguity guard.
--
-- Two granted clinical functions in this plan had NEVER WORKED:
--
--   public.rename_clinical_photo        (repaired by 20260901010401)
--   public.record_procedure_followup    (repaired by 20260901010402)
--
-- Both declare RETURNS TABLE(..., version integer), so `version` is a PL/pgSQL
-- OUT variable inside the body. Both then referenced `version` UNQUALIFIED
-- against a relation that also has a `version` column:
--
--   update ... set version=version+1 ... returning version into v_version
--   update ... set event_id=v_event,version=version where ...
--
-- PostgreSQL rejects those at RUNTIME with 42702 "column reference is
-- ambiguous". Nothing caught it because only the denial paths were covered: a
-- test that proves anon is refused proves nothing about whether the authorized
-- call can succeed. Both repairs resolve it the same way - alias the target
-- relation, and address the OUT parameter through its qualified label.
--
-- This suite makes that defect CLASS detectable instead of waiting for the
-- third instance. The live function set is derived from pg_proc, not from
-- migration text: the migrations contain hundreds of `returns table`
-- occurrences including superseded definitions, and only what is installed
-- matters.
--
-- THE RULE. For a set-returning PL/pgSQL function with an OUT parameter named
-- N, an occurrence of N in the body that is
--
--   * immediately after `returning`, or
--   * immediately after `=`
--
-- and is NOT dot-qualified is an ambiguity risk. That is precisely the shape of
-- all three defective statements, and precisely not the shape of any of the
-- three repaired ones: a repaired statement writes `=alias.version` and
-- `returning alias.version`, and its only bare `version` is the SET target,
-- where a column reference is the sole legal reading.
--
-- The suite is deliberately non-vacuous: it asserts the candidate set is large
-- and includes both repaired functions, and it asserts the rule still fires on
-- the pre-repair statement text so a rule that stopped matching anything
-- cannot pass silently.
--
-- All values here are function metadata. No patient or clinical data is read.

begin;

select extensions.no_plan();

create temporary view out_parameter_candidate as
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
  a.name as out_parameter,
  p.prosrc as body
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join pg_catalog.pg_language l on l.oid = p.prolang and l.lanname = 'plpgsql'
cross join lateral (
  select
    argument_name.name,
    coalesce(argument_mode.mode, 'i'::"char") as mode
  from unnest(p.proargnames) with ordinality as argument_name(name, ord)
  left join unnest(p.proargmodes) with ordinality as argument_mode(mode, ord)
    on argument_mode.ord = argument_name.ord
) a
where n.nspname in ('public', 'private')
  and p.proretset
  and a.mode in ('o', 'b', 't')
  and a.name is not null;

-- The detection pattern, written once so the property and the teeth check can
-- never drift apart.
create temporary view out_parameter_ambiguity as
select
  schema_name,
  function_name,
  identity_arguments,
  out_parameter
from out_parameter_candidate
where body ~* ('(returning|=)[[:space:]]*' || out_parameter || '[^[:alnum:]_.]');

-- 1. NON-VACUITY. A guard that examines nothing passes for the wrong reason.
select extensions.ok(
  (select count(*) from out_parameter_candidate) >= 100,
  'the OUT-parameter ambiguity guard examines the live set-returning function set'
);

select extensions.is(
  (select count(*)::integer
   from out_parameter_candidate
   where schema_name = 'public'
     and function_name in ('rename_clinical_photo', 'record_procedure_followup')
     and out_parameter = 'version'),
  2,
  'both previously broken functions are inside the examined set'
);

-- 2. TEETH. The rule must still fire on the exact pre-repair statement text,
--    and must not fire on the exact repaired text. Without this, a rule that
--    silently stopped matching would report a clean database forever.
select extensions.ok(
  ' update public.clinical_photographs set display_filename=p_display_filename,version=version+1 where organization_id=v_org and id=p_photo_id returning version into v_version;'
    ~* '(returning|=)[[:space:]]*version[^[:alnum:]_.]',
  'the rule fires on the pre-repair clinical photograph rename statement'
);

select extensions.ok(
  not (' update public.clinical_photographs as photo set display_filename=p_display_filename,version=photo.version+1 where photo.organization_id=v_org and photo.id=p_photo_id returning photo.version into v_version;'
    ~* '(returning|=)[[:space:]]*version[^[:alnum:]_.]'),
  'the rule does not fire on the repaired clinical photograph rename statement'
);

select extensions.ok(
  ' update public.procedure_cases set version=version+1 where organization_id=v_organization_id and id=v_case.id returning version into version;'
    ~* '(returning|=)[[:space:]]*version[^[:alnum:]_.]',
  'the rule fires on the pre-repair procedure case version statement'
);

select extensions.ok(
  ' update private.odontogram_revamp_idempotency set event_id=v_event,version=version where organization_id=v_organization_id;'
    ~* '(returning|=)[[:space:]]*version[^[:alnum:]_.]',
  'the rule fires on the pre-repair follow-up idempotency statement'
);

select extensions.ok(
  not (' update public.procedure_cases as procedure_case set version=procedure_case.version+1 where procedure_case.organization_id=v_organization_id and procedure_case.id=v_case.id returning procedure_case.version into record_procedure_followup.version;'
    ~* '(returning|=)[[:space:]]*version[^[:alnum:]_.]'),
  'the rule does not fire on the repaired procedure case version statement'
);

-- 3. THE PROPERTY. No installed function may carry the ambiguity.
select extensions.is(
  (select coalesce(
     string_agg(
       schema_name || '.' || function_name || '(' || identity_arguments || ') OUT ' || out_parameter,
       ', ' order by schema_name, function_name, out_parameter),
     '')
   from out_parameter_ambiguity),
  '',
  'no installed set-returning function references an OUT parameter ambiguously'
);

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result
from test_failures;

rollback;
