-- Serialize identical execution idempotency keys before the implementation's
-- precheck. Distinct keys still race on the projection version as intended.

alter function public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)
rename to transition_treatment_plan_item_execution_serialized_impl;
alter function public.transition_treatment_plan_item_execution_serialized_impl(uuid,uuid,integer,text,text,text)
set schema private;
revoke all on function private.transition_treatment_plan_item_execution_serialized_impl(uuid,uuid,integer,text,text,text)
from public,anon,authenticated,service_role;

create function public.transition_treatment_plan_item_execution(
 p_acting_branch_id uuid,p_item_id uuid,p_expected_version integer,p_target_state text,p_reason text,p_idempotency_key text
) returns table(item_id uuid,execution_state text,version integer,patient_id uuid)
language plpgsql security definer set search_path=''
as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  coalesce(p_item_id::text,'')||':'||coalesce(p_idempotency_key,''),0));
 return query select r.item_id,r.execution_state,r.version,r.patient_id
 from private.transition_treatment_plan_item_execution_serialized_impl(
  p_acting_branch_id,p_item_id,p_expected_version,p_target_state,p_reason,p_idempotency_key) r;
end $$;
revoke all on function public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)
from public,anon,authenticated,service_role;

alter function public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)
rename to correct_treatment_plan_item_execution_serialized_impl;
alter function public.correct_treatment_plan_item_execution_serialized_impl(uuid,uuid,integer,text,text,text)
set schema private;
revoke all on function private.correct_treatment_plan_item_execution_serialized_impl(uuid,uuid,integer,text,text,text)
from public,anon,authenticated,service_role;

create function public.correct_treatment_plan_item_execution(
 p_acting_branch_id uuid,p_item_id uuid,p_expected_version integer,p_target_state text,p_reason text,p_idempotency_key text
) returns table(item_id uuid,execution_state text,version integer,patient_id uuid)
language plpgsql security definer set search_path=''
as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  coalesce(p_item_id::text,'')||':'||coalesce(p_idempotency_key,''),0));
 return query select r.item_id,r.execution_state,r.version,r.patient_id
 from private.correct_treatment_plan_item_execution_serialized_impl(
  p_acting_branch_id,p_item_id,p_expected_version,p_target_state,p_reason,p_idempotency_key) r;
end $$;
revoke all on function public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)
from public,anon,authenticated,service_role;

alter function public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text)
rename to complete_treatment_plan_item_with_charge_serialized_impl;
alter function public.complete_treatment_plan_item_with_charge_serialized_impl(uuid,uuid,integer,bigint,text,jsonb,text)
set schema private;
revoke all on function private.complete_treatment_plan_item_with_charge_serialized_impl(uuid,uuid,integer,bigint,text,jsonb,text)
from public,anon,authenticated,service_role;

create function public.complete_treatment_plan_item_with_charge(
 p_acting_branch_id uuid,p_item_id uuid,p_expected_version integer,p_amount_centavos bigint,p_completion_kind text,p_completion_payload jsonb,p_idempotency_key text
) returns table(item_id uuid,execution_state text,version integer,charge_id uuid,clinical_entry_id uuid,bridge_id uuid,implant_component_id uuid,patient_id uuid)
language plpgsql security definer set search_path=''
as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  coalesce(p_item_id::text,'')||':'||coalesce(p_idempotency_key,''),0));
 return query select r.item_id,r.execution_state,r.version,r.charge_id,r.clinical_entry_id,r.bridge_id,r.implant_component_id,r.patient_id
 from private.complete_treatment_plan_item_with_charge_serialized_impl(
  p_acting_branch_id,p_item_id,p_expected_version,p_amount_centavos,p_completion_kind,p_completion_payload,p_idempotency_key) r;
end $$;
revoke all on function public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text)
from public,anon,authenticated,service_role;

