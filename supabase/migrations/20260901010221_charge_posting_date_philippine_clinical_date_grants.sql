-- Browser boundary after the charge posting-date correction.
--
-- 20260901010220 changes one expression inside an existing function body. It
-- grants nothing and revokes nothing, and CREATE OR REPLACE preserves the ACL,
-- so no privilege moved and this file is deliberately NOT registered as a
-- grant-terminal migration.
--
-- What it does is assert, fail-closed, that nothing moved. A guarded replace
-- that accidentally dropped SECURITY DEFINER, widened the search path, or
-- disturbed the billing boundary would otherwise deploy silently and be caught
-- only by review.

do $boundary$
declare
  v_problem text;
begin
  -- 1. post_charge keeps its definer posture and is reachable by exactly the
  --    roles that held it before.
  select pg_catalog.string_agg(issue.detail, '; ')
  into v_problem
  from (
    select 'post_charge is not SECURITY DEFINER' as detail
    from pg_catalog.pg_proc as p
    where p.oid = 'public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)'::regprocedure
      and not p.prosecdef
    union all
    select 'post_charge lost its empty search_path'
    from pg_catalog.pg_proc as p
    where p.oid = 'public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)'::regprocedure
      and p.proconfig is distinct from array['search_path=""']::text[]
    union all
    select 'post_charge is executable by ' || role.role_name
    from (values ('anon'), ('public')) as role(role_name)
    where pg_catalog.has_function_privilege(
      role.role_name, 'public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)', 'execute')
  ) as issue;

  if v_problem is not null then
    raise exception using errcode = '55000',
      message = 'the charge posting boundary moved: ' || v_problem;
  end if;

  -- 2. The repaired body derives the Philippine clinical date and no UTC date.
  select pg_catalog.string_agg(issue.detail, '; ')
  into v_problem
  from (
    select 'post_charge does not derive the Philippine clinical date' as detail
    where pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(
        'public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)'::regprocedure),
      'Asia/Manila') = 0
    union all
    select 'post_charge still derives a date from the server timezone'
    where pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(
        'public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)'::regprocedure),
      'statement_timestamp()::date') <> 0
    union all
    select 'post_charge lost the appointment-linked service date branch'
    where pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(
        'public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)'::regprocedure),
      'v_service_date := v_appointment_starts::date;') = 0
  ) as issue;

  if v_problem is not null then
    raise exception using errcode = '55000',
      message = 'the charge posting date derivation is wrong: ' || v_problem;
  end if;

  -- 3. The ledger tables keep zero browser DML privilege. The repair touched a
  --    function body, so this must still be true.
  select pg_catalog.string_agg(leak.table_name || '/' || leak.role_name, ', ')
  into v_problem
  from (
    select scoped.table_name, role.role_name
    from (values ('charges'), ('payments'), ('payment_allocations')) as scoped(table_name)
    cross join (values ('anon'), ('authenticated'), ('public')) as role(role_name)
    where pg_catalog.has_table_privilege(role.role_name, 'public.' || scoped.table_name, 'INSERT')
       or pg_catalog.has_table_privilege(role.role_name, 'public.' || scoped.table_name, 'UPDATE')
       or pg_catalog.has_table_privilege(role.role_name, 'public.' || scoped.table_name, 'DELETE')
  ) as leak;

  if v_problem is not null then
    raise exception using errcode = '55000',
      message = 'ledger tables must hold no browser DML privilege: ' || v_problem;
  end if;
end
$boundary$;
