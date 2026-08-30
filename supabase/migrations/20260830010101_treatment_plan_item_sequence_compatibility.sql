-- Forward-only compatibility repair for 20260830010100. Existing reviewed
-- treatment-plan writers create line numbers but do not yet carry structured
-- sequence numbers; draft inserts therefore derive sequence_no from line_no.

create or replace function private.default_treatment_plan_item_sequence_no()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sequence_no is null then
    new.sequence_no := new.line_no;
  end if;
  return new;
end;
$$;

revoke all on function private.default_treatment_plan_item_sequence_no() from public, anon, authenticated, service_role;

create trigger treatment_plan_items_default_sequence_no
before insert on public.treatment_plan_items
for each row execute function private.default_treatment_plan_item_sequence_no();
