-- O2/O13 terminal compatibility: preserve the legacy rows and prevent any
-- new owner-side mutation path after browser RPC retirement.
create trigger tooth_conditions_read_only
before insert or update or delete on public.tooth_conditions
for each row execute function private.prevent_legacy_tooth_condition_mutation();
