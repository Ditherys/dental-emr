-- O5 terminal grants: the only browser-reachable odontogram surfaces.
-- service_role is never granted these RPCs; the object migration already
-- revoked every role and this file restores exactly authenticated.

grant execute on function public.get_patient_odontogram(uuid, uuid) to authenticated;
grant execute on function public.record_tooth_clinical_entry(uuid, uuid, text, text[], text, text, text, text) to authenticated;
grant execute on function public.amend_tooth_clinical_entry(uuid, uuid, integer, text, text[], text) to authenticated;
grant execute on function public.void_tooth_clinical_entry(uuid, uuid, integer, text) to authenticated;
grant execute on function public.resolve_legacy_odontogram_entry(uuid, uuid, text, uuid, text) to authenticated;

grant execute on function public.create_plan_bridge_design(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.update_draft_plan_bridge_design(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.record_current_bridge(uuid, uuid, jsonb, uuid, timestamptz, uuid) to authenticated;
grant execute on function public.amend_current_bridge(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.void_current_bridge(uuid, uuid, integer, text) to authenticated;

grant execute on function public.create_plan_implant_design(uuid, uuid, uuid, jsonb) to authenticated;
grant execute on function public.update_draft_plan_implant_design(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.record_current_implant_component(uuid, uuid, jsonb, uuid, timestamptz, uuid) to authenticated;
grant execute on function public.amend_current_implant_component(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.void_current_implant_component(uuid, uuid, integer, text) to authenticated;

grant execute on function public.create_periodontal_examination(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.save_periodontal_measurements(uuid, uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.finalize_periodontal_examination(uuid, uuid, integer) to authenticated;
grant execute on function public.amend_periodontal_examination(uuid, uuid, uuid) to authenticated;

grant execute on function public.transition_treatment_plan_item_execution(uuid, uuid, integer, text, text) to authenticated;
grant execute on function public.complete_treatment_plan_item_with_charge(uuid, uuid, integer, uuid, bigint, date) to authenticated;
grant execute on function public.correct_treatment_plan_item_execution(uuid, uuid, integer, text, text) to authenticated;

revoke execute on function public.get_patient_odontogram(uuid, uuid) from service_role;
revoke execute on function public.record_tooth_clinical_entry(uuid, uuid, text, text[], text, text, text, text) from service_role;
revoke execute on function public.amend_tooth_clinical_entry(uuid, uuid, integer, text, text[], text) from service_role;
revoke execute on function public.void_tooth_clinical_entry(uuid, uuid, integer, text) from service_role;
revoke execute on function public.resolve_legacy_odontogram_entry(uuid, uuid, text, uuid, text) from service_role;
revoke execute on function public.create_plan_bridge_design(uuid, uuid, uuid, jsonb) from service_role;
revoke execute on function public.update_draft_plan_bridge_design(uuid, uuid, integer, jsonb) from service_role;
revoke execute on function public.record_current_bridge(uuid, uuid, jsonb, uuid, timestamptz, uuid) from service_role;
revoke execute on function public.amend_current_bridge(uuid, uuid, integer, jsonb) from service_role;
revoke execute on function public.void_current_bridge(uuid, uuid, integer, text) from service_role;
revoke execute on function public.create_plan_implant_design(uuid, uuid, uuid, jsonb) from service_role;
revoke execute on function public.update_draft_plan_implant_design(uuid, uuid, integer, jsonb) from service_role;
revoke execute on function public.record_current_implant_component(uuid, uuid, jsonb, uuid, timestamptz, uuid) from service_role;
revoke execute on function public.amend_current_implant_component(uuid, uuid, integer, jsonb) from service_role;
revoke execute on function public.void_current_implant_component(uuid, uuid, integer, text) from service_role;
revoke execute on function public.create_periodontal_examination(uuid, uuid, uuid, text) from service_role;
revoke execute on function public.save_periodontal_measurements(uuid, uuid, jsonb, jsonb, jsonb, jsonb) from service_role;
revoke execute on function public.finalize_periodontal_examination(uuid, uuid, integer) from service_role;
revoke execute on function public.amend_periodontal_examination(uuid, uuid, uuid) from service_role;
revoke execute on function public.transition_treatment_plan_item_execution(uuid, uuid, integer, text, text) from service_role;
revoke execute on function public.complete_treatment_plan_item_with_charge(uuid, uuid, integer, uuid, bigint, date) from service_role;
revoke execute on function public.correct_treatment_plan_item_execution(uuid, uuid, integer, text, text) from service_role;
