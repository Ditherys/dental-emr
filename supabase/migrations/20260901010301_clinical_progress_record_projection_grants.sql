-- Browser boundary for the canonical chronological progress record.
--
-- One stable SECURITY DEFINER function with an empty search path. It derives
-- organization and actor server-side, requires live patient.clinical.read at an
-- active acting branch, revalidates the patient against the derived tenant, and
-- writes nothing - no row, no state change, and no audit event - so reading a
-- patient's history never opens an encounter and never records the clinical
-- content it returned. `authenticated` is the only role that may execute it.
--
-- The two derivation helpers stay private. They carry no authorization of their
-- own precisely because the projection has already performed it.

grant execute on function public.get_clinical_progress_record_v1(uuid,uuid,integer,integer) to authenticated;

do $boundary$
begin
  if pg_catalog.has_function_privilege('anon', 'private.clinical_progress_case_money(uuid,uuid)', 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'private.clinical_progress_case_money(uuid,uuid)', 'execute')
     or pg_catalog.has_function_privilege('service_role', 'private.clinical_progress_case_money(uuid,uuid)', 'execute')
     or pg_catalog.has_function_privilege('public', 'private.clinical_progress_case_money(uuid,uuid)', 'execute')
     or pg_catalog.has_function_privilege('anon', 'private.clinical_progress_case_teeth(uuid,uuid)', 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'private.clinical_progress_case_teeth(uuid,uuid)', 'execute')
     or pg_catalog.has_function_privilege('service_role', 'private.clinical_progress_case_teeth(uuid,uuid)', 'execute')
     or pg_catalog.has_function_privilege('public', 'private.clinical_progress_case_teeth(uuid,uuid)', 'execute') then
    raise exception using errcode = '55000',
      message = 'the progress-record derivation helpers must not be browser or service callable';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'get_clinical_progress_record_v1'
      and (
        not p.prosecdef
        or p.proconfig is distinct from array['search_path=""']::text[]
        or p.provolatile <> 's'
        or pg_catalog.has_function_privilege('public', p.oid, 'execute')
        or pg_catalog.has_function_privilege('anon', p.oid, 'execute')
        or pg_catalog.has_function_privilege('service_role', p.oid, 'execute')
      )
  ) then
    raise exception using errcode = '55000',
      message = 'the clinical progress projection must stay stable, definer-scoped, and browser-only';
  end if;
end
$boundary$;
