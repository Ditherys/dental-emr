-- O5 revamp terminal grants. No service role or base-table grant is allowed.
grant execute on function public.get_patient_odontogram_v3(uuid,uuid) to authenticated;
grant execute on function public.record_tooth_clinical_entry_v3(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text) to authenticated;
grant execute on function public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,text) to authenticated;
grant execute on function public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,text) to authenticated;
grant execute on function public.record_direct_treatment_with_charge(uuid,uuid,uuid,bigint,jsonb,text) to authenticated;
grant execute on function public.record_procedure_followup(uuid,uuid,text,timestamptz,text) to authenticated;
revoke all on function public.get_patient_odontogram_v3(uuid,uuid) from public,anon,service_role;
revoke all on function public.record_tooth_clinical_entry_v3(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text) from public,anon,service_role;
revoke all on function public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,text) from public,anon,service_role;
revoke all on function public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,text) from public,anon,service_role;
revoke all on function public.record_direct_treatment_with_charge(uuid,uuid,uuid,bigint,jsonb,text) from public,anon,service_role;
revoke all on function public.record_procedure_followup(uuid,uuid,text,timestamptz,text) from public,anon,service_role;
