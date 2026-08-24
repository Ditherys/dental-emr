-- P2-01 grant-terminal migration. Restore only the approved callers for the
-- existing signatures replaced by 20260819010000_patient_permission_contract.

grant execute on function public.set_member_role(uuid, uuid, uuid, boolean)
to authenticated;

grant execute on function public.list_workforce_invitation_options(uuid)
to service_role;

grant execute on function public.prepare_workforce_invitation(uuid, uuid, uuid, text, uuid, uuid)
to service_role;

grant execute on function public.finalize_workforce_invitation(uuid, uuid, uuid)
to service_role;
