-- P19-03 terminal grant for the bounded branch transfer projection.

grant execute on function public.list_inventory_transfers(uuid, text) to authenticated;
revoke execute on function public.list_inventory_transfers(uuid, text) from service_role;
