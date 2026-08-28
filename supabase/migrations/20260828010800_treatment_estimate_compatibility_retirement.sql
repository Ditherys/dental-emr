-- B11: drop the legacy treatment-plan compatibility trigger and the legacy
-- estimated_fee decimal column. Centavo is now the canonical treatment-plan
-- estimate; the compatibility trigger and legacy column are no longer
-- needed. RPCs that still accept p_estimated_fee numeric remain in place
-- for backward compatibility (and accept the bound null sentinel) until
-- a follow-up migration upgrades them to centavo inputs.

drop trigger if exists treatment_plan_items_sync_estimated_fee on public.treatment_plan_items;
drop trigger if exists treatment_plan_items_estimated_fee_compat on public.treatment_plan_items;
drop function if exists private.sync_treatment_plan_estimated_fee();
alter table public.treatment_plan_items drop constraint if exists treatment_plan_items_estimated_fee_check;
alter table public.treatment_plan_items drop column if exists estimated_fee;
