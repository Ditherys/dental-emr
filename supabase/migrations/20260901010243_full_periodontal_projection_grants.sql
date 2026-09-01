-- Browser boundary for the periodontal read projections.
--
-- Both are stable SECURITY DEFINER functions with an empty search path. They
-- derive organization and actor server-side, require live patient.clinical.read
-- at an active acting branch, revalidate every supplied identifier against the
-- derived tenant and patient, and write nothing - no row, no state change, and
-- no audit event - so opening or comparing a periodontal chart never opens an
-- encounter. `authenticated` is the only role that may execute them.

grant execute on function public.get_periodontal_workspace_v2(uuid,uuid,uuid) to authenticated;
grant execute on function public.compare_periodontal_examinations_v2(uuid,uuid,uuid,uuid) to authenticated;

do $boundary$
begin
  if pg_catalog.has_function_privilege('anon', 'private.periodontal_examination_summary(uuid,uuid)', 'execute')
     or pg_catalog.has_function_privilege('authenticated', 'private.periodontal_examination_summary(uuid,uuid)', 'execute')
     or pg_catalog.has_function_privilege('service_role', 'private.periodontal_examination_summary(uuid,uuid)', 'execute')
     or pg_catalog.has_function_privilege('public', 'private.periodontal_examination_summary(uuid,uuid)', 'execute') then
    raise exception using errcode = '55000',
      message = 'the periodontal comparison summary helper must not be browser or service callable';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('get_periodontal_workspace_v2', 'compare_periodontal_examinations_v2')
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
      message = 'the periodontal read projections must stay stable, definer-scoped, and browser-only';
  end if;
end
$boundary$;
