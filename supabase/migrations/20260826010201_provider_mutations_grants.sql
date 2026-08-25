-- P3-03 grant terminal: authenticated provider configuration mutation surfaces only.
grant execute on function public.create_provider(uuid, jsonb) to authenticated;
grant execute on function public.update_provider(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.archive_provider(uuid, uuid, integer) to authenticated;
grant execute on function public.create_specialty(uuid, text, text) to authenticated;
grant execute on function public.update_specialty(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.set_provider_branches(uuid, uuid, integer, uuid[]) to authenticated;
grant execute on function public.set_provider_specialties(uuid, uuid, integer, jsonb) to authenticated;
