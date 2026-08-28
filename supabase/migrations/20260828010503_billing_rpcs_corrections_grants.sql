-- B6 terminal grants restored after the forward function corrections.

grant execute on function public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)
to authenticated;
grant execute on function public.clear_postdated_cheque(uuid,uuid,text)
to authenticated;

revoke execute on function public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)
from service_role;
revoke execute on function public.clear_postdated_cheque(uuid,uuid,text)
from service_role;
