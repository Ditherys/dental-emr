-- B2 compatibility: keep the legacy decimal treatment-plan estimate and the new
-- centavo estimate column exactly in sync at the row level. Legacy RPC writes
-- (decimal only) derive centavos; centavo-only writes keep the legacy column
-- readable for the pre-billing application; a conflicting dual value is
-- rejected. B11 removes this trigger and the legacy column together.

create or replace function private.sync_treatment_plan_estimated_fee()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_centavos bigint;
begin
  if new.estimated_fee is not null then
    if new.estimated_fee * 100 <> pg_catalog.trunc(new.estimated_fee * 100) then
      raise check_violation using message = 'treatment plan estimate cannot be represented exactly in centavos';
    end if;
    if new.estimated_fee * 100 > 99999999999 then
      raise check_violation using message = 'treatment plan estimate exceeds the centavo bound';
    end if;
    v_centavos := (new.estimated_fee * 100)::bigint;
    if new.estimated_fee_centavos is not null and new.estimated_fee_centavos <> v_centavos then
      raise check_violation using message = 'treatment plan estimate decimal and centavo values conflict';
    end if;
    new.estimated_fee_centavos := v_centavos;
  elsif new.estimated_fee_centavos is not null then
    new.estimated_fee := new.estimated_fee_centavos / 100.0;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_treatment_plan_estimated_fee() from public, anon, authenticated, service_role;

create trigger treatment_plan_items_sync_estimated_fee
before insert or update of estimated_fee, estimated_fee_centavos
on public.treatment_plan_items
for each row execute function private.sync_treatment_plan_estimated_fee();