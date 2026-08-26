-- P4-05 grant terminal: the only browser-reachable patient file read surface.

grant execute on function public.list_patient_files(uuid, uuid, boolean)
to authenticated;
grant execute on function public.get_file_metadata(uuid, uuid)
to authenticated;

revoke all on function public.list_patient_files(uuid, uuid, boolean)
from service_role;
revoke all on function public.get_file_metadata(uuid, uuid)
from service_role;
