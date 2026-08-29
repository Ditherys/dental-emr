begin;

select extensions.no_plan();

-- Synthetic-only P16-01 graph. Direct inserts as the owner bypass RLS; the
-- schema is deny-by-default with zero base grants and no browser policies.
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b7200000-0000-0000-0000-000000000001','P1601 Synthetic A Inc.','P1601 A','p1601-a'),
  ('b7200000-0000-0000-0000-000000000002','P1601 Synthetic B Inc.','P1601 B','p1601-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b7300000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','P1601 A Main','p1601-a-main','P1601-A','1 Synthetic St','Test City','Test Province');
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b7500000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','P1601-A-1','Patient','A',date '1990-01-01','b7300000-0000-0000-0000-000000000001'),
  ('b7500000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000002','P1601-B-1','Patient','B',date '1991-01-01',null);
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status) values
  ('c9200000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active'),
  ('c9200000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000002','Dentist','B1','REGULAR','active');
insert into public.procedures (id, organization_id, code, name, status) values
  ('c9300000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','PROC_A1','Synthetic Procedure A1','active'),
  ('c9300000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000002','PROC_B1','Synthetic Procedure B1','active');

select extensions.columns_are('public','treatment_plans',array['id','organization_id','patient_id','title','status','version','created_by','created_at','updated_at'],'treatment_plans has only the approved P16-01 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.treatment_plans'::regclass),'treatment_plans has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.treatment_plans',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no treatment_plans privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='treatment_plans'),0,'treatment_plans is deny-by-default with no browser policies');
select extensions.is((select count(*)::integer from pg_indexes where schemaname='public' and tablename='treatment_plans' and indexname='treatment_plans_organization_patient_status_idx'),1,'treatment_plans indexes the org+patient+status access path');
select extensions.is((select count(*)::integer from pg_indexes where schemaname='public' and tablename='treatment_plans' and indexname='treatment_plans_organization_id_id_key'),1,'treatment_plans exposes the composite unique(org,id) target for child FKs');

select extensions.columns_are('public','treatment_plan_items',array['id','organization_id','plan_id','line_no','procedure_id','tooth_code','description','created_at','estimated_fee_centavos'],'treatment_plan_items has only the approved fields and the canonical centavo estimate');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.treatment_plan_items'::regclass),'treatment_plan_items has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.treatment_plan_items',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no treatment_plan_items privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='treatment_plan_items'),0,'treatment_plan_items is deny-by-default with no browser policies');
select extensions.is((select count(*)::integer from pg_indexes where schemaname='public' and tablename='treatment_plan_items' and indexname='treatment_plan_items_organization_plan_line_idx'),1,'treatment_plan_items indexes the org+plan+line_no access path');

select extensions.columns_are('public','treatment_plan_alternatives',array['id','organization_id','plan_id','alternative_no','summary','created_at'],'treatment_plan_alternatives has only the approved P16-01 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.treatment_plan_alternatives'::regclass),'treatment_plan_alternatives has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.treatment_plan_alternatives',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no treatment_plan_alternatives privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='treatment_plan_alternatives'),0,'treatment_plan_alternatives is deny-by-default with no browser policies');
select extensions.is((select count(*)::integer from pg_indexes where schemaname='public' and tablename='treatment_plan_alternatives' and indexname='treatment_plan_alternatives_organization_plan_alternative_idx'),1,'treatment_plan_alternatives indexes the org+plan+alternative_no access path');

select extensions.columns_are('public','treatment_plan_discussions',array['id','organization_id','plan_id','discussed_by','treating_provider_id','discussed_at','context','notes','created_at'],'treatment_plan_discussions has only the approved P16-01 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.treatment_plan_discussions'::regclass),'treatment_plan_discussions has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.treatment_plan_discussions',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no treatment_plan_discussions privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='treatment_plan_discussions'),0,'treatment_plan_discussions is deny-by-default with no browser policies');
select extensions.is((select count(*)::integer from pg_indexes where schemaname='public' and tablename='treatment_plan_discussions' and indexname='treatment_plan_discussions_organization_plan_discussed_at_idx'),1,'treatment_plan_discussions indexes the org+plan+discussed_at access path');

select extensions.columns_are('public','treatment_plan_drawings',array['id','organization_id','plan_id','drawing','updated_by','updated_at','version'],'treatment_plan_drawings has only the approved P16-01 fields');
select extensions.ok((select relrowsecurity from pg_class where oid = 'public.treatment_plan_drawings'::regclass),'treatment_plan_drawings has RLS enabled');
select extensions.ok(not exists(select 1 from (values(0::oid),((select oid from pg_roles where rolname='anon')),((select oid from pg_roles where rolname='authenticated')),((select oid from pg_roles where rolname='service_role'))) as role(role_oid) cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) as privilege(name) where has_table_privilege(role.role_oid,'public.treatment_plan_drawings',privilege.name)),'PUBLIC, anon, authenticated, and service_role have no treatment_plan_drawings privileges');
select extensions.is((select count(*)::integer from pg_policies where schemaname='public' and tablename='treatment_plan_drawings'),0,'treatment_plan_drawings is deny-by-default with no browser policies');
select extensions.is((select count(*)::integer from pg_indexes where schemaname='public' and tablename='treatment_plan_drawings' and indexname='treatment_plan_drawings_organization_plan_key'),1,'treatment_plan_drawings keeps exactly one drawing per plan via unique(org,plan_id)');

select extensions.ok(not exists (
  select 1 from pg_proc as proc
  where proc.oid = 'private.protect_treatment_plan_immutability()'::regprocedure
    and (
      has_function_privilege('public', proc.oid, 'execute')
      or has_function_privilege('anon', proc.oid, 'execute')
      or has_function_privilege('authenticated', proc.oid, 'execute')
      or has_function_privilege('service_role', proc.oid, 'execute')
    )
),'the treatment plan immutability trigger function is revoked from every role');
select extensions.is((select count(*)::integer from pg_proc where oid = 'private.protect_treatment_plan_immutability()'::regprocedure and proconfig = array['search_path=""']::text[]),1,'the treatment plan immutability trigger function pins an empty search path');

-- treatment_plans: defaults, bounded title/status/version, and immutability.
select extensions.lives_ok($$insert into public.treatment_plans (id,organization_id,patient_id,title) values ('d1600000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','Full mouth restoration')$$,'a DRAFT plan is accepted with a bounded title');
select extensions.ok((select status='DRAFT' and version=1 and created_at is not null and updated_at is not null and created_by is null from public.treatment_plans where id='d1600000-0000-0000-0000-000000000001'),'treatment_plans default to DRAFT at version one with both timestamps stamped');
select extensions.lives_ok($$update public.treatment_plans set title='Revised full mouth restoration', version=2 where id='d1600000-0000-0000-0000-000000000001'$$,'a DRAFT plan remains editable');
select extensions.lives_ok($$delete from public.treatment_plans where id='d1600000-0000-0000-0000-000000000001'$$,'a DRAFT plan may be deleted');
select extensions.throws_ok($$insert into public.treatment_plans (organization_id,patient_id,title,status) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','   ','DRAFT')$$,'23514',null,'a blank title is rejected');
select extensions.throws_ok($$insert into public.treatment_plans (organization_id,patient_id,title) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',repeat('t',201))$$,'23514',null,'a title longer than 200 characters is rejected');
select extensions.throws_ok($$insert into public.treatment_plans (organization_id,patient_id,title,status) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','Locked plan','LOCKED')$$,'23514',null,'plan status is bounded to DRAFT/PRESENTED/ACKNOWLEDGED');
select extensions.throws_ok($$insert into public.treatment_plans (organization_id,patient_id,title,version) values ('b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','Zero version',0)$$,'23514',null,'plan version must be positive');

select extensions.lives_ok($$insert into public.treatment_plans (id,organization_id,patient_id,title,status) values ('d1600000-0000-0000-0000-000000000006','b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','Presented plan','PRESENTED')$$,'a PRESENTED plan row is accepted directly');
select extensions.throws_ok($$update public.treatment_plans set title='rewrite' where id='d1600000-0000-0000-0000-000000000006'$$,'23514','presented/acknowledged treatment plans are immutable; create a new version','a PRESENTED plan rejects UPDATE by the immutable trigger');
select extensions.throws_ok($$delete from public.treatment_plans where id='d1600000-0000-0000-0000-000000000006'$$,'23514','presented/acknowledged treatment plans are immutable; create a new version','a PRESENTED plan rejects DELETE by the immutable trigger');
select extensions.lives_ok($$insert into public.treatment_plans (id,organization_id,patient_id,title,status) values ('d1600000-0000-0000-0000-000000000003','b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','Acknowledged plan','ACKNOWLEDGED')$$,'an ACKNOWLEDGED plan row is accepted directly');
select extensions.throws_ok($$update public.treatment_plans set title='rewrite' where id='d1600000-0000-0000-0000-000000000003'$$,'23514','presented/acknowledged treatment plans are immutable; create a new version','an ACKNOWLEDGED plan rejects UPDATE by the immutable trigger');
select extensions.throws_ok($$delete from public.treatment_plans where id='d1600000-0000-0000-0000-000000000003'$$,'23514','presented/acknowledged treatment plans are immutable; create a new version','an ACKNOWLEDGED plan rejects DELETE by the immutable trigger');
select extensions.lives_ok($$insert into public.treatment_plans (id,organization_id,patient_id,title) values ('d1600000-0000-0000-0000-000000000004','b7200000-0000-0000-0000-000000000002','b7500000-0000-0000-0000-000000000002','Foreign tenant plan')$$,'a tenant-B plan is accepted for the cross-tenant FK probe');

-- Use a fresh DRAFT parent for the direct child-table contract probes; the
-- preceding PRESENTED/ACKNOWLEDGED rows intentionally remain immutable.
delete from public.treatment_plans where id='d1600000-0000-0000-0000-000000000002';
insert into public.treatment_plans (id,organization_id,patient_id,title,status)
values ('d1600000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','Presented plan child probes','DRAFT');

-- treatment_plan_items: line numbering, FDI teeth, bounded fees, composite FKs.
select extensions.lives_ok($$insert into public.treatment_plan_items (id,organization_id,plan_id,line_no,procedure_id,tooth_code,description,estimated_fee_centavos) values ('d1610000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',1,'c9300000-0000-0000-0000-000000000001','26','Composite filling on 26.',250000)$$,'an item with an org-scoped procedure, valid FDI tooth, and bounded centavo estimate is accepted');
select extensions.ok((select line_no=1 and procedure_id='c9300000-0000-0000-0000-000000000001' and tooth_code='26' and description='Composite filling on 26.' and estimated_fee_centavos=250000 from public.treatment_plan_items where id='d1610000-0000-0000-0000-000000000001'),'the item persists its exact centavo projection');
select extensions.lives_ok($$insert into public.treatment_plan_items (organization_id,plan_id,line_no,estimated_fee_centavos,description) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',3,3333,'centavo-only fee')$$,'a centavo-only estimate is accepted');
select extensions.throws_ok($$insert into public.treatment_plan_items (organization_id,plan_id,line_no,description) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',0,'zero line')$$,'23514',null,'item line_no must be at least one');
select extensions.throws_ok($$insert into public.treatment_plan_items (organization_id,plan_id,line_no,description) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',1,'duplicate line')$$,'23505',null,'a duplicate line_no in the same plan is rejected');
select extensions.throws_ok($$insert into public.treatment_plan_items (organization_id,plan_id,line_no,tooth_code,description) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',2,'49','out of range tooth')$$,'23514',null,'an out-of-range FDI tooth code is rejected');
select extensions.throws_ok($$insert into public.treatment_plan_items (organization_id,plan_id,line_no,estimated_fee_centavos,description) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',2,-1,'negative fee')$$,'23514',null,'a negative centavo estimate is rejected');
select extensions.throws_ok($$insert into public.treatment_plan_items (organization_id,plan_id,line_no,estimated_fee_centavos,description) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',2,100000000000,'oversized fee')$$,'23514',null,'a centavo estimate above 99,999,999,999 is rejected');
select extensions.throws_ok($$insert into public.treatment_plan_items (organization_id,plan_id,line_no,description) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',2,'   ')$$,'23514',null,'a blank item description is rejected');
select extensions.throws_ok($$insert into public.treatment_plan_items (organization_id,plan_id,line_no,description) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',2,repeat('d',2001))$$,'23514',null,'an item description longer than 2000 characters is rejected');
select extensions.throws_ok($$insert into public.treatment_plan_items (organization_id,plan_id,line_no,procedure_id,description) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',2,'c9300000-0000-0000-0000-000000000002','foreign procedure')$$,'23503',null,'a foreign-org procedure cannot satisfy the composite procedure FK');
select extensions.throws_ok($$insert into public.treatment_plan_items (organization_id,plan_id,line_no,description) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000004',2,'foreign plan')$$,'23503',null,'a foreign-org plan cannot satisfy the composite plan FK');

-- treatment_plan_alternatives: numbering and bounds.
select extensions.lives_ok($$insert into public.treatment_plan_alternatives (id,organization_id,plan_id,alternative_no,summary) values ('d1620000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',1,'Extraction and implant alternative.')$$,'an alternative is accepted at number one');
select extensions.throws_ok($$insert into public.treatment_plan_alternatives (organization_id,plan_id,alternative_no,summary) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',1,'duplicate alternative')$$,'23505',null,'a duplicate alternative_no in the same plan is rejected');
select extensions.throws_ok($$insert into public.treatment_plan_alternatives (organization_id,plan_id,alternative_no,summary) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',2,'   ')$$,'23514',null,'a blank alternative summary is rejected');

-- treatment_plan_discussions: provider/time/context and cross-tenant FK.
select extensions.lives_ok($$insert into public.treatment_plan_discussions (id,organization_id,plan_id,discussed_by,treating_provider_id,discussed_at,context,notes) values ('d1630000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',null,'c9200000-0000-0000-0000-000000000001',statement_timestamp(),'Case discussion','Patient prefers conservative care.')$$,'a discussion with an org-scoped provider and bounded context is accepted');
select extensions.throws_ok($$insert into public.treatment_plan_discussions (organization_id,plan_id,treating_provider_id,discussed_at,context) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002','c9200000-0000-0000-0000-000000000002',statement_timestamp(),'foreign provider')$$,'23503',null,'a foreign-org treating provider cannot satisfy the composite provider FK');
select extensions.throws_ok($$insert into public.treatment_plan_discussions (organization_id,plan_id,discussed_at,context) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',statement_timestamp(),repeat('c',201))$$,'23514',null,'a discussion context longer than 200 characters is rejected');
select extensions.throws_ok($$insert into public.treatment_plan_discussions (organization_id,plan_id,discussed_at,context,notes) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',statement_timestamp(),'Context',repeat('n',4001))$$,'23514',null,'discussion notes longer than 4000 characters are rejected');

-- treatment_plan_drawings: bounded renderer-independent object and one-per-plan.
select extensions.lives_ok($$insert into public.treatment_plan_drawings (id,organization_id,plan_id,drawing,version) values ('d1640000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002','{"strokes":[]}'::jsonb,1)$$,'a bounded object drawing is accepted at version one');
select extensions.throws_ok($$insert into public.treatment_plan_drawings (organization_id,plan_id,drawing) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002','[1,2,3]'::jsonb)$$,'23514',null,'a non-object drawing is rejected');
select extensions.throws_ok($$insert into public.treatment_plan_drawings (organization_id,plan_id,drawing) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002',jsonb_build_object('data',repeat('x',70000)))$$,'23514',null,'a drawing larger than 65536 bytes is rejected');
select extensions.throws_ok($$insert into public.treatment_plan_drawings (organization_id,plan_id,drawing) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000002','{"strokes":[]}'::jsonb)$$,'23505',null,'a second drawing for the same plan is rejected by unique(org,plan_id)');
select extensions.throws_ok($$insert into public.treatment_plan_drawings (organization_id,plan_id,drawing,version) values ('b7200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000003','{"strokes":[]}'::jsonb,0)$$,'23514',null,'a drawing version must be positive');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
