-- P19-02 grant terminal: the only browser-reachable inventory surfaces.
-- service_role is never granted these RPCs; the object migration already
-- revoked every role (including the private permission helper and the audit
-- metadata allow-list predicate) and this file restores exactly authenticated.
-- The append-only movement trigger and the permission helper stay revoked from
-- every role.

grant execute on function public.create_inventory_item(uuid, text, text, text, text, integer, boolean) to authenticated;
grant execute on function public.update_inventory_item(uuid, uuid, integer, text, text, text, integer, boolean, boolean) to authenticated;
grant execute on function public.list_inventory_items(uuid, boolean) to authenticated;
grant execute on function public.receive_stock(uuid, uuid, integer, text, date) to authenticated;
grant execute on function public.adjust_stock(uuid, uuid, integer, integer, text) to authenticated;
grant execute on function public.issue_stock(uuid, uuid, integer, integer, text) to authenticated;
grant execute on function public.create_inventory_transfer(uuid, uuid, uuid, uuid, integer, text) to authenticated;
grant execute on function public.confirm_transfer_receipt(uuid, uuid, integer) to authenticated;
grant execute on function public.cancel_inventory_transfer(uuid, uuid, integer, text) to authenticated;
grant execute on function public.list_inventory_stock(uuid, uuid, boolean) to authenticated;
grant execute on function public.list_inventory_movements(uuid, uuid) to authenticated;
grant execute on function public.get_inventory_aggregate(uuid) to authenticated;

revoke execute on function public.create_inventory_item(uuid, text, text, text, text, integer, boolean) from service_role;
revoke execute on function public.update_inventory_item(uuid, uuid, integer, text, text, text, integer, boolean, boolean) from service_role;
revoke execute on function public.list_inventory_items(uuid, boolean) from service_role;
revoke execute on function public.receive_stock(uuid, uuid, integer, text, date) from service_role;
revoke execute on function public.adjust_stock(uuid, uuid, integer, integer, text) from service_role;
revoke execute on function public.issue_stock(uuid, uuid, integer, integer, text) from service_role;
revoke execute on function public.create_inventory_transfer(uuid, uuid, uuid, uuid, integer, text) from service_role;
revoke execute on function public.confirm_transfer_receipt(uuid, uuid, integer) from service_role;
revoke execute on function public.cancel_inventory_transfer(uuid, uuid, integer, text) from service_role;
revoke execute on function public.list_inventory_stock(uuid, uuid, boolean) from service_role;
revoke execute on function public.list_inventory_movements(uuid, uuid) from service_role;
revoke execute on function public.get_inventory_aggregate(uuid) from service_role;