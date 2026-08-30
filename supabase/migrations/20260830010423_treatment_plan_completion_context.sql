-- O8/O9: a narrow, server-authorized DTO for the only treatment-plan items
-- that can actually be completed. It deliberately does not trust browser
-- supplied provider, patient, case version, finding, or design data.
create function public.get_treatment_plan_completion_context(
  p_acting_branch_id uuid,
  p_plan_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_org uuid;
  v_actor uuid := (select auth.uid());
  v_patient_name text;
  v_dentist_name text;
  v_cases jsonb;
  v_findings jsonb;
begin
  select organization_id into v_org
  from public.branches
  where id=p_acting_branch_id and status='active';

  if v_org is null or v_actor is null
     or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.read')
     or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.write')
     or not private.has_billing_permission_at_branch(p_acting_branch_id,'billing.charge') then
    raise insufficient_privilege using message='not authorized';
  end if;

  select coalesce(nullif(pg_catalog.btrim(patient.preferred_name),''),pg_catalog.concat_ws(' ',patient.first_name,patient.middle_name,patient.last_name,patient.suffix))
  into v_patient_name
  from public.treatment_plans plan
  join public.patients patient on patient.organization_id=plan.organization_id and patient.id=plan.patient_id
  where plan.organization_id=v_org and plan.id=p_plan_id and plan.status='ACKNOWLEDGED';
  if v_patient_name is null then
    raise insufficient_privilege using message='not authorized';
  end if;

  select pg_catalog.concat_ws(' ',provider.first_name,provider.last_name)
  into v_dentist_name
  from public.providers provider
  join public.provider_branches provider_branch
    on provider_branch.organization_id=provider.organization_id
   and provider_branch.provider_id=provider.id
  where provider.organization_id=v_org
    and provider.linked_user_id=v_actor
    and provider.status='active'
    and provider_branch.branch_id=p_acting_branch_id
    and provider_branch.is_active
  limit 1;
  if v_dentist_name is null then
    raise insufficient_privilege using message='not authorized';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'caseId',procedure_case.id,
    'planItemId',item.id,
    'expectedVersion',procedure_case.version,
    'procedureName',coalesce(procedure.name,item.description),
    'completion',case contract.materialization_kind
      when 'BRIDGE' then jsonb_build_object('kind','BRIDGE','units',contract.design_snapshot->'units')
      when 'IMPLANT' then jsonb_build_object('kind','IMPLANT','components',contract.design_snapshot->'components')
      else null
    end
  ) order by item.sequence_no,item.line_no,item.id),'[]'::jsonb)
  into v_cases
  from public.procedure_cases procedure_case
  join public.treatment_plan_items item
    on item.organization_id=procedure_case.organization_id
   and item.id=procedure_case.treatment_plan_item_id
  join public.treatment_plan_item_executions execution
    on execution.organization_id=item.organization_id and execution.item_id=item.id
  join public.treatment_plan_item_materialization_contracts contract
    on contract.organization_id=item.organization_id and contract.item_id=item.id
  left join public.procedures procedure
    on procedure.organization_id=procedure_case.organization_id and procedure.id=procedure_case.procedure_id
  where procedure_case.organization_id=v_org
    and item.plan_id=p_plan_id
    and procedure_case.status='OPEN'
    and execution.current_state='IN_PROGRESS';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',finding.id,
    'label',pg_catalog.concat('Tooth ',finding.tooth_code,' — ',pg_catalog.replace(finding.clinical_code,'_',' '),
      case when cardinality(finding.surfaces)>0 then pg_catalog.concat(' (',array_to_string(finding.surfaces,','),')') else '' end)
  ) order by finding.recorded_at,finding.id),'[]'::jsonb)
  into v_findings
  from (
    select entry.id,entry.tooth_code,entry.clinical_code,entry.recorded_at,
      coalesce(array_agg(surface.surface order by surface.surface) filter (where surface.surface is not null),'{}'::text[]) as surfaces
    from public.tooth_clinical_entries entry
    left join public.tooth_clinical_entry_surfaces surface
      on surface.organization_id=entry.organization_id and surface.entry_id=entry.id
    where entry.organization_id=v_org
      and entry.patient_id=(select patient_id from public.treatment_plans where organization_id=v_org and id=p_plan_id)
      and entry.kind='FINDING'
      and entry.lifecycle='OPEN'
      and not exists (
        select 1 from public.procedure_case_finding_resolutions resolution
        where resolution.organization_id=entry.organization_id and resolution.finding_entry_id=entry.id
      )
    group by entry.id,entry.tooth_code,entry.clinical_code,entry.recorded_at
    order by entry.recorded_at,entry.id
    limit 100
  ) finding;

  return jsonb_build_object(
    'patientName',v_patient_name,
    'signedInDentist',v_dentist_name,
    'serviceDate',current_date::text,
    'findingChoices',v_findings,
    'cases',v_cases
  );
end;
$$;

revoke all on function public.get_treatment_plan_completion_context(uuid,uuid) from public,anon,authenticated,service_role;
