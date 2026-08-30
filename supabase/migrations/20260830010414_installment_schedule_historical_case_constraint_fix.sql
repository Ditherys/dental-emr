-- The original named DROP used the untruncated identifier while PostgreSQL
-- stored the generated 63-byte constraint name. Remove it forward-only so the
-- reviewed ACTIVE-only unique index can admit historical schedule versions.
alter table public.procedure_installment_schedules drop constraint if exists procedure_installment_schedul_organization_id_procedure_cas_key;
