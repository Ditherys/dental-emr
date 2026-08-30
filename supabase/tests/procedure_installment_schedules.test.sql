begin;
select extensions.plan(5);
select extensions.ok(to_regclass('public.procedure_installment_schedules') is not null and to_regclass('public.procedure_installment_schedule_items') is not null, 'schedule expectation tables exist');
select extensions.ok((select relrowsecurity from pg_class where oid='public.procedure_installment_schedules'::regclass) and (select relrowsecurity from pg_class where oid='public.procedure_installment_schedule_items'::regclass), 'schedule tables have RLS');
select extensions.ok(not has_table_privilege('authenticated','public.procedure_installment_schedules','select') and not has_table_privilege('authenticated','public.procedure_installment_schedule_items','insert'), 'schedule base tables have no browser grants');
select extensions.ok(exists(select 1 from pg_constraint where conrelid='public.procedure_installment_schedule_items'::regclass and contype='u'), 'schedule item ordinals are unique per schedule');
select extensions.ok(position('payment_allocations' in pg_get_functiondef('public.create_procedure_installment_schedule(uuid,uuid,jsonb,text)'::regprocedure))=0, 'expectation RPC cannot post or derive ledger allocations');
select * from extensions.finish(); rollback;
