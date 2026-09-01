-- Browser boundary for the versioned periodontal examination workflows.
--
-- Four SECURITY DEFINER writers with an empty search path. Each derives
-- organization, patient, acting branch, actor, treating provider and encounter
-- server-side, requires live patient.clinical.write at that branch plus an
-- active linked provider there, and accepts none of those from a client.
-- `authenticated` is the only role that may execute any of them.
--
-- The three shipped periodontal boundaries keep their existing grants: they are
-- superseded for new work but were repaired in place by 20260901010240 rather
-- than revoked, so no privilege is withdrawn here and none of the assertions
-- pinning their reachability change meaning.

grant execute on function public.create_periodontal_draft_v2(uuid,uuid,text,timestamptz,uuid) to authenticated;
grant execute on function public.save_periodontal_measurements_v2(uuid,integer,jsonb,uuid) to authenticated;
grant execute on function public.finalize_periodontal_examination_v2(uuid,integer,jsonb,uuid) to authenticated;
grant execute on function public.amend_periodontal_examination_v2(uuid,text,uuid) to authenticated;

do $boundary$
declare
  v_leak text;
begin
  -- The private helpers this task introduced stay unreachable from every
  -- browser and service role, and the new writers keep their definer posture.
  select pg_catalog.string_agg(leak.signature || '/' || leak.role_name, ', ')
  into v_leak
  from (
    select helper.signature, role.role_name
    from (values
      ('private.periodontal_derived_classification(uuid,uuid)'),
      ('private.periodontal_tooth_reductions(uuid,uuid)'),
      ('private.periodontal_current_state_conflict(uuid,uuid,text)'),
      ('private.periodontal_batch_section_is_valid(jsonb,text[],text[],text[],text[])'),
      ('private.resolve_actor_provider_at_branch(uuid,uuid,uuid)')
    ) as helper(signature)
    cross join (values ('anon'), ('authenticated'), ('service_role'), ('public')) as role(role_name)
    where pg_catalog.has_function_privilege(role.role_name, helper.signature, 'execute')
  ) as leak;

  if v_leak is not null then
    raise exception using errcode = '55000',
      message = 'task 11 periodontal private helpers must not be browser or service callable: ' || v_leak;
  end if;

  select pg_catalog.string_agg(p.proname, ', ')
  into v_leak
  from pg_catalog.pg_proc as p
  join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'create_periodontal_draft_v2', 'save_periodontal_measurements_v2',
      'finalize_periodontal_examination_v2', 'amend_periodontal_examination_v2'
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
      message = 'task 11 periodontal writers lost their definer posture: ' || v_leak;
  end if;

  -- The request-key store is server-only.
  if pg_catalog.has_table_privilege('authenticated', 'private.periodontal_workflow_idempotency', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'private.periodontal_workflow_idempotency', 'SELECT')
     or pg_catalog.has_table_privilege('service_role', 'private.periodontal_workflow_idempotency', 'SELECT') then
    raise exception using errcode = '55000',
      message = 'the periodontal request-key store must hold no browser or service privilege';
  end if;
end
$boundary$;
