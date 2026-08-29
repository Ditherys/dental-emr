-- Terminal reconciliation after the O5/O8 explicit forward replacements.
-- Every definition migration revoked all roles; restore only authenticated.

grant execute on function public.get_patient_odontogram(uuid,uuid) to authenticated;
grant execute on function public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,text) to authenticated;
grant execute on function public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text) to authenticated;
grant execute on function public.void_tooth_clinical_entry(uuid,uuid,integer,text) to authenticated;
grant execute on function public.resolve_legacy_odontogram_entry(uuid,uuid,text,uuid,uuid,uuid,text) to authenticated;
grant execute on function public.create_plan_bridge_design(uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.update_draft_plan_bridge_design(uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.record_current_bridge(uuid,uuid,jsonb,uuid,timestamptz,uuid) to authenticated;
grant execute on function public.amend_current_bridge(uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.void_current_bridge(uuid,uuid,integer,text) to authenticated;
grant execute on function public.create_plan_implant_design(uuid,uuid,uuid,jsonb) to authenticated;
grant execute on function public.update_draft_plan_implant_design(uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.record_current_implant_component(uuid,uuid,jsonb,uuid,timestamptz,uuid) to authenticated;
grant execute on function public.amend_current_implant_component(uuid,uuid,integer,jsonb) to authenticated;
grant execute on function public.void_current_implant_component(uuid,uuid,integer,text) to authenticated;
grant execute on function public.create_periodontal_examination(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.finalize_periodontal_examination(uuid,uuid,integer) to authenticated;
grant execute on function public.amend_periodontal_examination(uuid,uuid,uuid) to authenticated;
grant execute on function public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text,text) to authenticated;
grant execute on function public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text) to authenticated;
grant execute on function public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text) to authenticated;
