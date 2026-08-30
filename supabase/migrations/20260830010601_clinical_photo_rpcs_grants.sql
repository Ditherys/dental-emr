-- O12 browser/server action grant terminal. All RPCs enforce tenant and
-- clinical permission checks; no table or service-role grants are exposed.
grant execute on function public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text) to authenticated;
grant execute on function public.list_clinical_photos(uuid,uuid) to authenticated;
grant execute on function public.rename_clinical_photo(uuid,uuid,integer,text) to authenticated;
grant execute on function public.pair_clinical_photos(uuid,uuid,uuid) to authenticated;
grant execute on function public.record_clinical_photo_derivatives(uuid,uuid,text,bigint,jsonb) to authenticated;
revoke execute on function public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text),public.list_clinical_photos(uuid,uuid),public.rename_clinical_photo(uuid,uuid,integer,text),public.pair_clinical_photos(uuid,uuid,uuid),public.record_clinical_photo_derivatives(uuid,uuid,text,bigint,jsonb) from service_role;
