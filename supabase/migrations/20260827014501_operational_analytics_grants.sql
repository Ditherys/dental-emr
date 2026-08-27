-- P20-02 terminal grants for the aggregate-only operational analytics boundary.

grant execute on function public.get_operational_analytics_summary(uuid, uuid, integer)
to authenticated;

grant execute on function public.list_operational_analytics_breakdown(uuid, uuid, integer)
to authenticated;

revoke execute on function public.get_operational_analytics_summary(uuid, uuid, integer)
from service_role;

revoke execute on function public.list_operational_analytics_breakdown(uuid, uuid, integer)
from service_role;
