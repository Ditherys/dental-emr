-- Presence-aware structured detail patch: omitted fields retain their stored
-- values; explicit null is meaningful only for nullable notes.
create or replace function public.add_treatment_plan_item_centavos(
 p_acting_branch_id uuid,p_plan_id uuid,p_expected_version integer,p_procedure_id uuid,p_tooth_code text,p_description text,p_estimated_fee_centavos bigint,p_priority text,p_sequence_no integer,p_surfaces text[],p_notes text,p_has_priority boolean,p_has_sequence_no boolean,p_has_surfaces boolean,p_has_notes boolean
) returns table(item_id uuid,line_no integer) language plpgsql security definer set search_path='' as $$
declare r record;
begin
 select * into r from private.add_treatment_plan_item_centavos(p_acting_branch_id,p_plan_id,p_expected_version,p_procedure_id,p_tooth_code,p_description,p_estimated_fee_centavos);
 update public.treatment_plan_items set priority=case when p_has_priority then p_priority else 'ROUTINE' end,sequence_no=case when p_has_sequence_no then p_sequence_no else r.line_no end,surfaces=case when p_has_surfaces then p_surfaces else '{}'::text[] end,notes=case when p_has_notes then p_notes else null end where id=r.item_id;
 return query select r.item_id,r.line_no;
end;$$;
revoke all on function public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text,boolean,boolean,boolean,boolean) from public,anon,authenticated,service_role;
create or replace function public.update_treatment_plan_item_centavos(
 p_acting_branch_id uuid,p_plan_id uuid,p_item_id uuid,p_expected_version integer,p_procedure_id uuid,p_tooth_code text,p_description text,p_estimated_fee_centavos bigint,p_priority text,p_sequence_no integer,p_surfaces text[],p_notes text,p_has_priority boolean,p_has_sequence_no boolean,p_has_surfaces boolean,p_has_notes boolean
) returns table(item_id uuid,line_no integer) language plpgsql security definer set search_path='' as $$
declare r record;
begin
 select * into r from private.update_treatment_plan_item_centavos(p_acting_branch_id,p_plan_id,p_item_id,p_expected_version,p_procedure_id,p_tooth_code,p_description,p_estimated_fee_centavos);
 update public.treatment_plan_items set priority=case when p_has_priority then p_priority else priority end,sequence_no=case when p_has_sequence_no then p_sequence_no else sequence_no end,surfaces=case when p_has_surfaces then p_surfaces else surfaces end,notes=case when p_has_notes then p_notes else notes end where id=r.item_id;
 return query select r.item_id,r.line_no;
end;$$;
revoke all on function public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text,boolean,boolean,boolean,boolean) from public,anon,authenticated,service_role;
