grant execute on function public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,uuid,text) to authenticated;
revoke all on function public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,uuid,text) from public,anon,service_role;
