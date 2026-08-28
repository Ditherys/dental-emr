-- B6 terminal grants: authenticated EXECUTE only on the approved public billing
-- RPCs. Base tables remain grant-free; the audit and permission helpers remain
-- revoked from every role. service_role keeps no direct billing function access.

grant execute on function public.list_patient_account(uuid, uuid) to authenticated;
grant execute on function public.post_charge(uuid, uuid, uuid, uuid, bigint, uuid, boolean, text, text) to authenticated;
grant execute on function public.post_charge_with_attribution_override(uuid, uuid, uuid, date, uuid, uuid, bigint, uuid, boolean, text, text, text) to authenticated;
grant execute on function public.correct_charge_attribution(uuid, uuid, uuid, date, text, text) to authenticated;
grant execute on function public.void_charge(uuid, uuid, text, text) to authenticated;
grant execute on function public.approve_charge_direct_cost(uuid, uuid, text, bigint, text, text) to authenticated;
grant execute on function public.reverse_charge_direct_cost(uuid, uuid, text, text) to authenticated;
grant execute on function public.post_charge_adjustment(uuid, uuid, text, bigint, text, text) to authenticated;
grant execute on function public.reverse_charge_adjustment(uuid, uuid, text, text) to authenticated;
grant execute on function public.record_payment(uuid, uuid, uuid, bigint, text, text) to authenticated;
grant execute on function public.void_payment(uuid, uuid, text, text) to authenticated;
grant execute on function public.allocate_payment(uuid, uuid, uuid, uuid, bigint, text) to authenticated;
grant execute on function public.reverse_payment_allocation(uuid, uuid, bigint, text, text) to authenticated;
grant execute on function public.refund_payment(uuid, uuid, uuid, bigint, text, jsonb, text) to authenticated;
grant execute on function public.record_postdated_cheque(uuid, uuid, text, text, bigint, date, jsonb, text) to authenticated;
grant execute on function public.transition_postdated_cheque(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.clear_postdated_cheque(uuid, uuid, text) to authenticated;
grant execute on function public.list_payment_methods(uuid) to authenticated;
grant execute on function public.upsert_payment_method(uuid, text, text, boolean, uuid, integer, text) to authenticated;
grant execute on function public.set_provider_compensation_agreement(uuid, uuid, date, date, integer, text, text) to authenticated;
grant execute on function public.list_unresolved_charge_compensation(uuid, uuid) to authenticated;
grant execute on function public.resolve_charge_compensation(uuid, uuid, text, text) to authenticated;
grant execute on function public.list_provider_earnings(uuid, uuid, date, date) to authenticated;

revoke execute on function public.list_patient_account(uuid, uuid) from service_role;
revoke execute on function public.post_charge(uuid, uuid, uuid, uuid, bigint, uuid, boolean, text, text) from service_role;
revoke execute on function public.post_charge_with_attribution_override(uuid, uuid, uuid, date, uuid, uuid, bigint, uuid, boolean, text, text, text) from service_role;
revoke execute on function public.correct_charge_attribution(uuid, uuid, uuid, date, text, text) from service_role;
revoke execute on function public.void_charge(uuid, uuid, text, text) from service_role;
revoke execute on function public.approve_charge_direct_cost(uuid, uuid, text, bigint, text, text) from service_role;
revoke execute on function public.reverse_charge_direct_cost(uuid, uuid, text, text) from service_role;
revoke execute on function public.post_charge_adjustment(uuid, uuid, text, bigint, text, text) from service_role;
revoke execute on function public.reverse_charge_adjustment(uuid, uuid, text, text) from service_role;
revoke execute on function public.record_payment(uuid, uuid, uuid, bigint, text, text) from service_role;
revoke execute on function public.void_payment(uuid, uuid, text, text) from service_role;
revoke execute on function public.allocate_payment(uuid, uuid, uuid, uuid, bigint, text) from service_role;
revoke execute on function public.reverse_payment_allocation(uuid, uuid, bigint, text, text) from service_role;
revoke execute on function public.refund_payment(uuid, uuid, uuid, bigint, text, jsonb, text) from service_role;
revoke execute on function public.record_postdated_cheque(uuid, uuid, text, text, bigint, date, jsonb, text) from service_role;
revoke execute on function public.transition_postdated_cheque(uuid, uuid, text, text, text) from service_role;
revoke execute on function public.clear_postdated_cheque(uuid, uuid, text) from service_role;
revoke execute on function public.list_payment_methods(uuid) from service_role;
revoke execute on function public.upsert_payment_method(uuid, text, text, boolean, uuid, integer, text) from service_role;
revoke execute on function public.set_provider_compensation_agreement(uuid, uuid, date, date, integer, text, text) from service_role;
revoke execute on function public.list_unresolved_charge_compensation(uuid, uuid) from service_role;
revoke execute on function public.resolve_charge_compensation(uuid, uuid, text, text) from service_role;
revoke execute on function public.list_provider_earnings(uuid, uuid, date, date) from service_role;