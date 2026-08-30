-- Terminal repair: only provider-derived v3 writers are browser-callable.
grant execute on function public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,text) to authenticated;
grant execute on function public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,text) to authenticated;
revoke all on function public.record_current_bridge(uuid,uuid,jsonb,uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
revoke all on function public.record_current_implant_component(uuid,uuid,jsonb,uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
revoke all on function public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text) from public,anon,authenticated,service_role;
revoke all on function public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,text) from public,anon,authenticated,service_role;
