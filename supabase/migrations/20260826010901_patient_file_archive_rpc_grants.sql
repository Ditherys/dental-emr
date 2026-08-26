-- P4-06 grant terminal: the only browser-reachable patient file archive surface.

grant execute on function public.archive_file(uuid, uuid, integer)
to authenticated;

revoke all on function public.archive_file(uuid, uuid, integer)
from service_role;
