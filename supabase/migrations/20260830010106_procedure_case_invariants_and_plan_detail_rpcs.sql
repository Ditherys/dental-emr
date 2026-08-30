-- Forward-only Task 4 remediation: case-correction lineage and structured
-- draft-item writers. Existing private writers retain authorization, locking,
-- optimistic versioning, and audit; these overloads persist bounded details in
-- the same transaction after that reviewed boundary succeeds.
create or replace function private.validate_procedure_case_correction_target()
returns trigger language plpgsql set search_path = '' as $$
declare v_case_id uuid;
begin
  if new.event_type = 'CORRECTION' then
    select procedure_case_id into v_case_id from public.procedure_case_events
    where organization_id=new.organization_id and id=new.correction_of_event_id;
    if v_case_id is distinct from new.procedure_case_id then
      raise exception using errcode='23514', message='procedure case correction must target an event in the same case';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_procedure_case_correction_target() from public, anon, authenticated, service_role;
create trigger procedure_case_events_validate_correction_target
before insert or update of organization_id,procedure_case_id,event_type,correction_of_event_id on public.procedure_case_events
for each row execute function private.validate_procedure_case_correction_target();

create or replace function public.add_treatment_plan_item_centavos(
  p_acting_branch_id uuid,p_plan_id uuid,p_expected_version integer,p_procedure_id uuid,p_tooth_code text,p_description text,p_estimated_fee_centavos bigint,
  p_priority text,p_sequence_no integer,p_surfaces text[],p_notes text
) returns table(item_id uuid,line_no integer)
language plpgsql security definer set search_path = '' as $$
declare v_result record;
begin
  select * into v_result from private.add_treatment_plan_item_centavos(p_acting_branch_id,p_plan_id,p_expected_version,p_procedure_id,p_tooth_code,p_description,p_estimated_fee_centavos);
  update public.treatment_plan_items set priority=coalesce(p_priority,'ROUTINE'),sequence_no=coalesce(p_sequence_no,v_result.line_no),surfaces=coalesce(p_surfaces,'{}'::text[]),notes=p_notes
  where organization_id=(select organization_id from public.treatment_plans where id=p_plan_id) and id=v_result.item_id;
  return query select v_result.item_id,v_result.line_no;
end;
$$;
revoke all on function public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text) from public, anon, authenticated, service_role;

create or replace function public.update_treatment_plan_item_centavos(
  p_acting_branch_id uuid,p_plan_id uuid,p_item_id uuid,p_expected_version integer,p_procedure_id uuid,p_tooth_code text,p_description text,p_estimated_fee_centavos bigint,
  p_priority text,p_sequence_no integer,p_surfaces text[],p_notes text
) returns table(item_id uuid,line_no integer)
language plpgsql security definer set search_path = '' as $$
declare v_result record;
begin
  select * into v_result from private.update_treatment_plan_item_centavos(p_acting_branch_id,p_plan_id,p_item_id,p_expected_version,p_procedure_id,p_tooth_code,p_description,p_estimated_fee_centavos);
  update public.treatment_plan_items set priority=coalesce(p_priority,priority),sequence_no=coalesce(p_sequence_no,sequence_no),surfaces=coalesce(p_surfaces,surfaces),notes=p_notes
  where id=v_result.item_id;
  return query select v_result.item_id,v_result.line_no;
end;
$$;
revoke all on function public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text) from public, anon, authenticated, service_role;
