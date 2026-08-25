-- P3-04 grant terminal: authenticated bounded provider configuration reads only.
grant execute on function public.list_provider_directory(uuid) to authenticated;
grant execute on function public.get_provider_configuration(uuid, uuid) to authenticated;
grant execute on function public.list_specialties(uuid) to authenticated;

revoke all on function public.list_provider_directory(uuid) from service_role;
revoke all on function public.get_provider_configuration(uuid, uuid) from service_role;
revoke all on function public.list_specialties(uuid) from service_role;
