-- Forward-only local repair for an already-applied O8 migration.  Resolution
-- records are legal/clinical history and must be append-only even for a
-- privileged accidental UPDATE/DELETE.
create function private.reject_procedure_case_finding_resolution_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  raise exception using errcode='P0001', message='procedure case finding resolutions are append-only';
end $$;

create trigger procedure_case_finding_resolutions_append_only_check
before update or delete on public.procedure_case_finding_resolutions
for each row execute function private.reject_procedure_case_finding_resolution_mutation();

revoke all on function private.reject_procedure_case_finding_resolution_mutation() from public, anon, authenticated, service_role;

-- This environment already recorded 10418 before its final review repair.
-- Recreate only the affected function body, forward-only, without a reset.
do $do$
declare v_definition text; v_replacement text;
begin
  select pg_catalog.pg_get_functiondef('public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text)'::regprocedure) into v_definition;
  v_replacement:=pg_catalog.replace(v_definition,
    'from public.post_charge(p_acting_branch_id,v_case.patient_id,v_case.procedure_id,p_plan_item_id,p_amount_centavos,null,false,case when p_amount_centavos=0 then ''Zero actual charge confirmed at completion'' else null end,''case-complete-''||p_idempotency_key);',
    'from public.post_charge(p_acting_branch_id,v_case.patient_id,v_case.procedure_id,p_plan_item_id,p_amount_centavos,null,false,case when p_amount_centavos=0 then ''Zero actual charge confirmed at completion'' else null end,''case-complete-''||p_idempotency_key) as posted;');
  if v_replacement=v_definition then raise exception using errcode='55000',message='expected completion charge alias repair target was not found'; end if;
  execute v_replacement;
end $do$;
