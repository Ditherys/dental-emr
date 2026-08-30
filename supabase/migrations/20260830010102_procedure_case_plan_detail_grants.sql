-- Terminal grant restoration after 20260830010100 replaces the bounded
-- treatment-plan detail projection. The function remains the same reviewed
-- authenticated clinical-read boundary; no table privilege is introduced.
grant execute on function public.get_treatment_plan_detail(uuid, uuid) to authenticated;
