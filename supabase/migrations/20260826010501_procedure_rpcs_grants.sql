-- P3-05 grant terminal: authenticated procedure configuration RPCs only.
grant execute on function public.create_procedure(uuid, jsonb) to authenticated;
grant execute on function public.update_procedure(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.archive_procedure(uuid, uuid, integer) to authenticated;
grant execute on function public.set_procedure_specialties(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.set_procedure_eligible_providers(uuid, uuid, integer, uuid[]) to authenticated;
grant execute on function public.list_procedures(uuid) to authenticated;
grant execute on function public.get_procedure_configuration(uuid, uuid) to authenticated;

revoke all on function public.create_procedure(uuid, jsonb) from service_role;
revoke all on function public.update_procedure(uuid, uuid, integer, jsonb) from service_role;
revoke all on function public.archive_procedure(uuid, uuid, integer) from service_role;
revoke all on function public.set_procedure_specialties(uuid, uuid, integer, jsonb) from service_role;
revoke all on function public.set_procedure_eligible_providers(uuid, uuid, integer, uuid[]) from service_role;
revoke all on function public.list_procedures(uuid) from service_role;
revoke all on function public.get_procedure_configuration(uuid, uuid) from service_role;
