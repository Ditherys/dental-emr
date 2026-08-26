-- P11-03 grant terminal: the only browser-reachable document surfaces.
-- service_role is never granted these RPCs; the object migration already
-- revoked every role and this file restores exactly authenticated.

grant execute on function public.generate_document(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.list_documents(uuid, uuid, text) to authenticated;
grant execute on function public.get_document_snapshot(uuid, uuid) to authenticated;

revoke execute on function public.generate_document(uuid, uuid, text, jsonb) from service_role;
revoke execute on function public.list_documents(uuid, uuid, text) from service_role;
revoke execute on function public.get_document_snapshot(uuid, uuid) from service_role;