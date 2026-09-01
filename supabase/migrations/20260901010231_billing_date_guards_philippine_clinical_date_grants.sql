-- Browser boundary after the billing date-guard correction.
--
-- 20260901010230 changes one expression inside each of three existing function
-- bodies. It grants nothing and revokes nothing, and CREATE OR REPLACE preserves
-- each ACL, so no privilege moved and this file is deliberately NOT registered
-- as a grant-terminal migration.
--
-- What it does is assert, fail-closed, that nothing moved and that the whole
-- billing surface now agrees on what "today" means. A guarded replace that
-- dropped SECURITY DEFINER, widened a search path, or repaired only some of the
-- functions would otherwise deploy silently.

do $boundary$
declare
  v_problem text;
begin
  -- 1. All four repaired billing functions keep their definer posture and stay
  --    unreachable from anon and PUBLIC.
  select pg_catalog.string_agg(issue.detail, '; ')
  into v_problem
  from (
    select p.proname || ' is not SECURITY DEFINER' as detail
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('post_charge', 'post_charge_with_attribution_override',
                        'correct_charge_attribution', 'list_pending_pdc')
      and not p.prosecdef
    union all
    select p.proname || ' lost its empty search_path'
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('post_charge', 'post_charge_with_attribution_override',
                        'correct_charge_attribution', 'list_pending_pdc')
      and p.proconfig is distinct from array['search_path=""']::text[]
    union all
    select p.proname || ' is executable by ' || role.role_name
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    cross join (values ('anon'), ('public')) as role(role_name)
    where n.nspname = 'public'
      and p.proname in ('post_charge', 'post_charge_with_attribution_override',
                        'correct_charge_attribution', 'list_pending_pdc')
      and pg_catalog.has_function_privilege(role.role_name, p.oid, 'execute')
  ) as issue;

  if v_problem is not null then
    raise exception using errcode = '55000',
      message = 'the billing boundary moved: ' || v_problem;
  end if;

  -- 2. Every one of the four derives the Philippine clinical date, and none of
  --    them derives a date from the server timezone any more. Checking all four
  --    together is the point: a partial repair is the failure mode worth
  --    catching, because it leaves the ledger internally inconsistent.
  select pg_catalog.string_agg(issue.detail, '; ')
  into v_problem
  from (
    select signature.text_value || ' does not derive the Philippine clinical date' as detail
    from (values
      ('public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)'),
      ('public.post_charge_with_attribution_override(uuid,uuid,uuid,date,uuid,uuid,bigint,uuid,boolean,text,text,text)'),
      ('public.correct_charge_attribution(uuid,uuid,uuid,date,text,text)'),
      ('public.list_pending_pdc(uuid,uuid)')
    ) as signature(text_value)
    where pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(signature.text_value::regprocedure), 'Asia/Manila') = 0
    union all
    select signature.text_value || ' still derives a date from the server timezone'
    from (values
      ('public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)'),
      ('public.post_charge_with_attribution_override(uuid,uuid,uuid,date,uuid,uuid,bigint,uuid,boolean,text,text,text)'),
      ('public.correct_charge_attribution(uuid,uuid,uuid,date,text,text)'),
      ('public.list_pending_pdc(uuid,uuid)')
    ) as signature(text_value)
    where pg_catalog.strpos(
            pg_catalog.pg_get_functiondef(signature.text_value::regprocedure),
            'statement_timestamp()::date') <> 0
       or pg_catalog.strpos(
            pg_catalog.pg_get_functiondef(signature.text_value::regprocedure),
            'current_date') <> 0
  ) as issue;

  if v_problem is not null then
    raise exception using errcode = '55000',
      message = 'the billing date derivation is inconsistent: ' || v_problem;
  end if;

  -- 3. The future-date refusals still exist. The repair moved which day counts
  --    as today; it must not have removed the bound.
  select pg_catalog.string_agg(issue.detail, '; ')
  into v_problem
  from (
    select 'post_charge_with_attribution_override lost its future service date refusal' as detail
    where pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(
        'public.post_charge_with_attribution_override(uuid,uuid,uuid,date,uuid,uuid,bigint,uuid,boolean,text,text,text)'::regprocedure),
      'if p_service_date >') = 0
    union all
    select 'correct_charge_attribution lost its future service date refusal'
    where pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(
        'public.correct_charge_attribution(uuid,uuid,uuid,date,text,text)'::regprocedure),
      'if p_corrected_service_date >') = 0
    union all
    select 'correct_charge_attribution lost its mandatory bounded reason'
    where pg_catalog.strpos(
      pg_catalog.pg_get_functiondef(
        'public.correct_charge_attribution(uuid,uuid,uuid,date,text,text)'::regprocedure),
      'p_reason is null') = 0
  ) as issue;

  if v_problem is not null then
    raise exception using errcode = '55000',
      message = 'a billing bound was lost by the date repair: ' || v_problem;
  end if;

  -- 4. The ledger tables keep zero browser DML privilege.
  select pg_catalog.string_agg(leak.table_name || '/' || leak.role_name, ', ')
  into v_problem
  from (
    select scoped.table_name, role.role_name
    from (values ('charges'), ('payments'), ('payment_allocations'), ('postdated_cheques'))
      as scoped(table_name)
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
