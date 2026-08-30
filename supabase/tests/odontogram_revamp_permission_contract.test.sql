begin;
select extensions.plan(4);
select extensions.ok(exists(select 1 from pg_proc where oid='private.require_active_actor_provider(uuid,uuid,uuid)'::regprocedure),'provider resolver exists');
select extensions.ok(not has_function_privilege('authenticated','private.require_active_actor_provider(uuid,uuid,uuid)','execute'),'provider resolver is not browser callable');
select extensions.ok(not has_table_privilege('authenticated','public.providers','select'),'provider base table remains private');
select extensions.ok(not has_table_privilege('authenticated','public.provider_branches','select'),'provider branch base table remains private');
with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$') select case when count(*)=0 then 'P1_TEST_PASS' else 'P1_TEST_FAIL' end as p1_test_result from test_failures;
rollback;
