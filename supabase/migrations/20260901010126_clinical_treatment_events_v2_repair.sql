-- Task 6 review round 1, forward repair of the applied treatment-event boundary.
--
-- Three bounded corrections, applied the way this repository already repairs the
-- O8 completion family: read the stored definition, replace exactly the target
-- text, and fail closed if a target is missing. No existing migration is edited,
-- no row is rewritten, and CREATE OR REPLACE preserves the reviewed grant.
--
-- 1. The backdating window was a hundred years on an event that posts money.
--    365 days is the defensible bound: it covers a late-entered treatment and a
--    year-end catch-up, and it stops a typo'd year from landing revenue in a
--    period nobody is still reconciling.
-- 2. The returned projection now carries the patient the server actually wrote
--    against, so a caller revalidates a server-resolved identifier rather than
--    the one it supplied. Every sibling RPC in this domain already does this.
-- 3. The delegated plan-linked path looked up the newest COMPLETION event on the
--    case instead of the row public.complete_treatment_case had just written. If
--    that helper ever stopped writing one, a pre-existing event id would be
--    reported as this call's event. The repair captures the case's COMPLETION
--    events before delegating, takes only an event that is not among them, and
--    raises rather than returning a stale id.
do $do$
declare
  v_definition text;
  v_replacement text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.record_treatment_event_v2(uuid,uuid,uuid,uuid,uuid,integer,text,date,uuid[],jsonb,bigint,jsonb,jsonb,uuid)'::regprocedure
  ) into v_definition;

  v_replacement := pg_catalog.replace(
    v_definition,
    'p_service_date < v_clinical_date - 36525',
    'p_service_date < v_clinical_date - 365'
  );
  if v_replacement = v_definition then
    raise exception using errcode = '55000', message = 'expected treatment-event service-date bound was not found';
  end if;

  v_replacement := pg_catalog.replace(
    v_replacement,
    '  v_completion_charge uuid;',
    '  v_completion_charge uuid;
  v_pre_completion_events uuid[];'
  );
  if pg_catalog.strpos(v_replacement, 'v_pre_completion_events uuid[];') = 0 then
    raise exception using errcode = '55000', message = 'expected treatment-event declaration target was not found';
  end if;

  v_replacement := pg_catalog.replace(
    v_replacement,
    '    select completion.charge_id, completion.clinical_entry_id',
    '    select coalesce(pg_catalog.array_agg(event.id), ''{}''::uuid[])
      into v_pre_completion_events
    from public.procedure_case_events as event
    where event.organization_id = v_organization_id
      and event.procedure_case_id = v_case.id
      and event.event_type = ''COMPLETION'';

    select completion.charge_id, completion.clinical_entry_id'
  );
  if pg_catalog.strpos(v_replacement, 'into v_pre_completion_events') = 0 then
    raise exception using errcode = '55000', message = 'expected treatment-event delegation target was not found';
  end if;

  v_replacement := pg_catalog.replace(
    v_replacement,
    '      and event.event_type = ''COMPLETION''
    order by event.recorded_at desc, event.id desc
    limit 1;
  else',
    '      and event.event_type = ''COMPLETION''
      and not (event.id = any(v_pre_completion_events))
    order by event.recorded_at desc, event.id desc
    limit 1;

    -- The delegated boundary is expected to have written exactly this event. A
    -- stale identifier is worse than a refusal, so refuse.
    if v_event_id is null then
      raise exception using errcode = ''P0001'', message = ''invalid state'';
    end if;
  else'
  );
  if pg_catalog.strpos(v_replacement, 'not (event.id = any(v_pre_completion_events))') = 0 then
    raise exception using errcode = '55000', message = 'expected treatment-event completion lookup target was not found';
  end if;

  v_replacement := pg_catalog.replace(
    v_replacement,
    '    ''procedure_case_id'', v_case.id,',
    '    ''patient_id'', p_patient_id,
    ''procedure_case_id'', v_case.id,'
  );
  if pg_catalog.strpos(v_replacement, '''patient_id'', p_patient_id,') = 0 then
    raise exception using errcode = '55000', message = 'expected treatment-event result projection target was not found';
  end if;

  execute v_replacement;
end $do$;
