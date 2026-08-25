-- P2-07 grant terminal: narrow authenticated child mutation surfaces only.
grant execute on function public.create_patient_contact(uuid,uuid,text,text,text,boolean,boolean) to authenticated;
grant execute on function public.update_patient_contact(uuid,uuid,uuid,integer,text,text,text,boolean,boolean) to authenticated;
grant execute on function public.archive_patient_contact(uuid,uuid,uuid,integer) to authenticated;
grant execute on function public.create_patient_relationship(uuid,uuid,uuid,text,text,text,text,boolean,boolean,boolean) to authenticated;
grant execute on function public.update_patient_relationship(uuid,uuid,uuid,integer,uuid,text,text,text,text,boolean,boolean,boolean) to authenticated;
grant execute on function public.archive_patient_relationship(uuid,uuid,uuid,integer) to authenticated;
