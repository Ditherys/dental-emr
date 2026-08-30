grant execute on function public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text) to authenticated;
grant execute on function public.get_patient_odontogram(uuid,uuid) to authenticated;
revoke execute on function public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text) from public,anon,service_role;
revoke execute on function public.get_patient_odontogram(uuid,uuid) from public,anon,service_role;
