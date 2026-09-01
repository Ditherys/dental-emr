-- Browser boundary after the task 9 review round 1 repair.
--
-- This round adds no browser-callable function and therefore grants nothing. It
-- does REVOKE one: 20260901010210 removes EXECUTE on
-- public.amend_periodontal_examination(uuid,uuid,uuid) from every role. The
-- revoke lives in the object migration, which is the pivot recorded as
-- `supersededFrom` in scripts/approved-final-grants.mjs; a grants file is never
-- the pivot.
--
-- Because nothing is granted, this file is deliberately NOT registered as a
-- grant-terminal migration. What it does instead is assert, fail-closed, that
-- the boundary is exactly where the repair intended to leave it.

do $boundary$
declare
  v_leak text;
begin
  -- 1. The reason-less amend path is unreachable from every role.
  select pg_catalog.string_agg(role.role_name, ', ')
  into v_leak
  from (values ('anon'), ('authenticated'), ('service_role'), ('public')) as role(role_name)
  where pg_catalog.has_function_privilege(
    role.role_name, 'public.amend_periodontal_examination(uuid,uuid,uuid)', 'execute');

  if v_leak is not null then
    raise exception using errcode = '55000',
      message = 'the reason-less periodontal amend boundary must be unreachable, but is held by: ' || v_leak;
  end if;

  -- 2. Revoking it did not disturb the other three periodontal boundaries.
  select pg_catalog.string_agg(reachable.signature, ', ')
  into v_leak
  from (values
    ('public.create_periodontal_examination(uuid,uuid,uuid,text)'),
    ('public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)'),
    ('public.finalize_periodontal_examination(uuid,uuid,integer)')
  ) as reachable(signature)
  where not pg_catalog.has_function_privilege('authenticated', reachable.signature, 'execute');

  if v_leak is not null then
    raise exception using errcode = '55000',
      message = 'authenticated lost a periodontal boundary it must retain: ' || v_leak;
  end if;

  -- 3. The periodontal tables still hold zero browser or service DML privilege.
  select pg_catalog.string_agg(leak.table_name || '/' || leak.role_name, ', ')
  into v_leak
  from (
    select scoped.table_name, role.role_name
    from (values
      ('periodontal_examinations'), ('periodontal_site_measurements'),
      ('periodontal_plaque_measurements'), ('periodontal_tooth_measurements'),
      ('periodontal_furcation_measurements')
    ) as scoped(table_name)
    cross join (values ('anon'), ('authenticated'), ('service_role'), ('public')) as role(role_name)
    where pg_catalog.has_table_privilege(role.role_name, 'public.' || scoped.table_name, 'SELECT')
       or pg_catalog.has_table_privilege(role.role_name, 'public.' || scoped.table_name, 'INSERT')
       or pg_catalog.has_table_privilege(role.role_name, 'public.' || scoped.table_name, 'UPDATE')
       or pg_catalog.has_table_privilege(role.role_name, 'public.' || scoped.table_name, 'DELETE')
  ) as leak;

  if v_leak is not null then
    raise exception using errcode = '55000',
      message = 'periodontal tables must hold no browser or service DML privilege: ' || v_leak;
  end if;

  -- 4. Every private helper this task introduced stays unreachable.
  select pg_catalog.string_agg(leak.signature || '/' || leak.role_name, ', ')
  into v_leak
  from (
    select helper.signature, role.role_name
    from (values
      ('private.periodontal_measurement_digest(uuid,uuid)'),
      ('private.enforce_perio_classification_fingerprint()'),
      ('private.validate_perio_surface_index_context()'),
      ('private.reset_perio_stale_classification(uuid,uuid)'),
      ('private.reset_perio_classification_on_measurement_change()'),
      ('private.reset_perio_classification_on_risk_change()')
    ) as helper(signature)
    cross join (values ('anon'), ('authenticated'), ('service_role'), ('public')) as role(role_name)
    where pg_catalog.has_function_privilege(role.role_name, helper.signature, 'execute')
  ) as leak;

  if v_leak is not null then
    raise exception using errcode = '55000',
      message = 'periodontal private helpers must not be browser or service callable: ' || v_leak;
  end if;

  -- 5. The reset layer is complete: three statement triggers on each of the four
  --    child tables. A missing one would silently reopen the stale-fingerprint
  --    path for that table and operation.
  select pg_catalog.string_agg(missing.relname, ', ')
  into v_leak
  from (
    select c.relname
    from pg_catalog.pg_class as c
    where c.relnamespace = 'public'::regnamespace
      and c.relname in (
        'periodontal_site_measurements', 'periodontal_plaque_measurements',
        'periodontal_tooth_measurements', 'periodontal_furcation_measurements'
      )
      and (
        select pg_catalog.count(*)
        from pg_catalog.pg_trigger as t
        where t.tgrelid = c.oid
          and not t.tgisinternal
          and t.tgfoid = 'private.reset_perio_classification_on_measurement_change()'::regprocedure
      ) <> 3
  ) as missing;

  if v_leak is not null then
    raise exception using errcode = '55000',
      message = 'every periodontal child table needs insert, update and delete reset triggers; incomplete on: ' || v_leak;
  end if;
end
$boundary$;
