-- P4-04 grant terminal: the only browser-reachable patient file upload surface.

grant execute on function public.create_file_upload(uuid, uuid, text, bigint)
to authenticated;
grant execute on function public.confirm_file_upload(uuid, uuid, integer)
to authenticated;

revoke all on function public.create_file_upload(uuid, uuid, text, bigint)
from service_role;
revoke all on function public.confirm_file_upload(uuid, uuid, integer)
from service_role;
