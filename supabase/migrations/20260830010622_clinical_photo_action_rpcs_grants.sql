-- O12/O13 clinical-photo action grant terminal. Base tables remain private;
-- only the narrow server-authorized RPCs are reachable by authenticated staff.

grant execute on function public.create_clinical_photo_source_upload(uuid,uuid,text,bigint)
to authenticated;
grant execute on function public.get_clinical_photo_source_upload(uuid,uuid,uuid)
to authenticated;
grant execute on function public.confirm_clinical_photo_source_upload(uuid,uuid,uuid,integer,bigint)
to authenticated;
grant execute on function public.get_clinical_photo_derivative(uuid,uuid,uuid,text)
to authenticated;
grant execute on function public.archive_clinical_photo(uuid,uuid,uuid,integer,text)
to authenticated;

revoke all on function public.create_clinical_photo_source_upload(uuid,uuid,text,bigint),
  public.get_clinical_photo_source_upload(uuid,uuid,uuid),
  public.confirm_clinical_photo_source_upload(uuid,uuid,uuid,integer,bigint),
  public.get_clinical_photo_derivative(uuid,uuid,uuid,text),
  public.archive_clinical_photo(uuid,uuid,uuid,integer,text)
from service_role;
