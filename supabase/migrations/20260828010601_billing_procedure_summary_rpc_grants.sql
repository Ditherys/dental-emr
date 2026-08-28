-- B8 terminal grants.

grant execute on function public.summarize_procedure_charges(uuid,uuid,uuid)
to authenticated;

revoke execute on function public.summarize_procedure_charges(uuid,uuid,uuid)
from service_role;
