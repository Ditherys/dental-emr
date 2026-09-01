-- Browser boundary for the expanded canonical periodontal model.
--
-- Task 9 adds no browser-callable function. It extends five existing tables,
-- adds two private helpers, and repairs two applied function bodies in place
-- under their existing signatures, so there is no new EXECUTE privilege to
-- grant and no existing privilege to revoke. This file therefore issues no
-- GRANT and no REVOKE, and is deliberately NOT registered as a grant-terminal
-- migration in scripts/approved-final-grants.mjs: registering an empty terminal
-- would add a boundary pivot where the boundary did not move.
--
-- What it does instead is assert that fact, fail-closed, at the migration
-- boundary. If a later edit to 20260901010200 ever leaks a table privilege onto
-- a periodontal table, exposes one of the new private helpers, or drops the
-- SECURITY DEFINER / empty-search-path posture of the repaired periodontal
-- boundary functions, this migration refuses to apply rather than letting the
-- deployment succeed and the review catch it afterwards.

do $boundary$
declare
  v_leak text;
begin
  -- 1. The periodontal tables remain reachable only through SECURITY DEFINER
  --    RPCs. Zero DML privilege for any browser or service role.
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

  -- 2. RLS stays enabled on every one of them.
  select pg_catalog.string_agg(c.relname, ', ')
  into v_leak
  from pg_catalog.pg_class as c
  where c.relnamespace = 'public'::regnamespace
    and c.relname in (
      'periodontal_examinations', 'periodontal_site_measurements',
      'periodontal_plaque_measurements', 'periodontal_tooth_measurements',
      'periodontal_furcation_measurements'
    )
    and not c.relrowsecurity;

  if v_leak is not null then
    raise exception using errcode = '55000',
      message = 'row level security must stay enabled on: ' || v_leak;
  end if;

  -- 3. The two private helpers this task introduced are not callable from a
  --    browser or service role.
  select pg_catalog.string_agg(leak.signature || '/' || leak.role_name, ', ')
  into v_leak
  from (
    select helper.signature, role.role_name
    from (values
      ('private.periodontal_measurement_digest(uuid,uuid)'),
      ('private.enforce_perio_classification_fingerprint()'),
      ('private.validate_perio_surface_index_context()')
    ) as helper(signature)
    cross join (values ('anon'), ('authenticated'), ('service_role'), ('public')) as role(role_name)
    where pg_catalog.has_function_privilege(role.role_name, helper.signature, 'execute')
  ) as leak;

  if v_leak is not null then
    raise exception using errcode = '55000',
      message = 'periodontal private helpers must not be browser or service callable: ' || v_leak;
  end if;

  -- 4. The periodontal boundary functions keep their SECURITY DEFINER and
  --    empty-search-path posture after the in-place repair.
  select pg_catalog.string_agg(p.proname, ', ')
  into v_leak
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_periodontal_examination', 'save_periodontal_measurements',
      'finalize_periodontal_examination', 'amend_periodontal_examination'
    )
    and (
      not p.prosecdef
      or p.proconfig is distinct from array['search_path=""']::text[]
      or pg_catalog.has_function_privilege('public', p.oid, 'execute')
      or pg_catalog.has_function_privilege('anon', p.oid, 'execute')
      or pg_catalog.has_function_privilege('service_role', p.oid, 'execute')
    );

  if v_leak is not null then
    raise exception using errcode = '55000',
      message = 'periodontal boundary functions lost their definer posture: ' || v_leak;
  end if;
end
$boundary$;
