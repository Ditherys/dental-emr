-- B3 correction: charges are immutable POSTED snapshots. VOIDED is derived from
-- the append-only charge_voids event, never from a mutable charge row. The B2
-- ledger migration guarded the event tables but not the charge row itself.

create trigger charges_append_only before update or delete on public.charges for each row execute function private.prevent_billing_ledger_mutation();