-- P5-05 grant terminal: the only browser-reachable patient referral surfaces.

grant execute on function public.create_patient_referral(uuid, uuid, jsonb) to authenticated;
grant execute on function public.update_patient_referral_status(uuid, uuid, integer, text) to authenticated;
grant execute on function public.list_patient_referrals(uuid, uuid, boolean) to authenticated;
