begin;

select extensions.no_plan();

-- Synthetic-only P15-02 graph, GUC-as-postgres. Owner/dentist A is the positive
-- writer; dental assistant A reads only; reception A has no clinical
-- permission; dentist B is foreign. Fixture inserts run as the owner; every
-- RPC call runs with set local role authenticated plus the request jwt claim.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('b7100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@p1502.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b7100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assistant-a@p1502.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b7100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception-a@p1502.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('b7100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@p1502.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('b7200000-0000-0000-0000-000000000001','P1502 Synthetic A Inc.','P1502 A','p1502-a'),
  ('b7200000-0000-0000-0000-000000000002','P1502 Synthetic B Inc.','P1502 B','p1502-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('b7300000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','P1502 A Main','p1502-a-main','P1502-A','1 Synthetic St','Test City','Test Province'),
  ('b7300000-0000-0000-0000-000000000003','b7200000-0000-0000-0000-000000000002','P1502 B Main','p1502-b-main','P1502-B','3 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('b7400000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('b7400000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('b7400000-0000-0000-0000-000000000003','b7200000-0000-0000-0000-000000000001','b7100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('b7400000-0000-0000-0000-000000000005','b7200000-0000-0000-0000-000000000002','b7100000-0000-0000-0000-000000000005','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('b7200000-0000-0000-0000-000000000001','b7300000-0000-0000-0000-000000000001','b7400000-0000-0000-0000-000000000001','active'),
  ('b7200000-0000-0000-0000-000000000001','b7300000-0000-0000-0000-000000000001','b7400000-0000-0000-0000-000000000002','active'),
  ('b7200000-0000-0000-0000-000000000001','b7300000-0000-0000-0000-000000000001','b7400000-0000-0000-0000-000000000003','active'),
  ('b7200000-0000-0000-0000-000000000002','b7300000-0000-0000-0000-000000000003','b7400000-0000-0000-0000-000000000005','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('b7200000-0000-0000-0000-000000000001'::uuid,'b7400000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'b7100000-0000-0000-0000-000000000001'::uuid),
  ('b7200000-0000-0000-0000-000000000001'::uuid,'b7400000-0000-0000-0000-000000000002'::uuid,'DENTAL_ASSISTANT'::text,null::uuid,'b7100000-0000-0000-0000-000000000001'::uuid),
  ('b7200000-0000-0000-0000-000000000001'::uuid,'b7400000-0000-0000-0000-000000000003'::uuid,'RECEPTIONIST'::text,'b7300000-0000-0000-0000-000000000001'::uuid,'b7100000-0000-0000-0000-000000000001'::uuid),
  ('b7200000-0000-0000-0000-000000000002'::uuid,'b7400000-0000-0000-0000-000000000005'::uuid,'DENTIST'::text,null::uuid,'b7100000-0000-0000-0000-000000000005'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('b7500000-0000-0000-0000-000000000001','b7200000-0000-0000-0000-000000000001','P1502-A-1','Patient','A',date '1990-01-01','b7300000-0000-0000-0000-000000000001'),
  ('b7500000-0000-0000-0000-000000000002','b7200000-0000-0000-0000-000000000002','P1502-B-1','Patient','B',date '1991-01-01',null);

create temp table p1502_conditions (seq integer primary key, id uuid);
grant select on p1502_conditions to authenticated;

select extensions.ok(
  has_function_privilege('authenticated','public.create_tooth_condition(uuid,uuid,text,text,text,text,text)','execute')
  and has_function_privilege('authenticated','public.void_tooth_condition(uuid,uuid,integer,text)','execute')
  and has_function_privilege('authenticated','public.list_tooth_conditions(uuid,uuid,boolean)','execute')
  and not has_function_privilege('anon','public.create_tooth_condition(uuid,uuid,text,text,text,text,text)','execute')
  and not has_function_privilege('anon','public.void_tooth_condition(uuid,uuid,integer,text)','execute')
  and not has_function_privilege('anon','public.list_tooth_conditions(uuid,uuid,boolean)','execute')
  and not has_function_privilege('service_role','public.create_tooth_condition(uuid,uuid,text,text,text,text,text)','execute')
  and not has_function_privilege('service_role','public.void_tooth_condition(uuid,uuid,integer,text)','execute')
  and not has_function_privilege('service_role','public.list_tooth_conditions(uuid,uuid,boolean)','execute'),
  'only authenticated has the three exact P15-02 RPC grants'
);
select extensions.is((select count(*)::integer from pg_proc where oid in ('public.create_tooth_condition(uuid,uuid,text,text,text,text,text)'::regprocedure,'public.void_tooth_condition(uuid,uuid,integer,text)'::regprocedure,'public.list_tooth_conditions(uuid,uuid,boolean)'::regprocedure) and prosecdef and proconfig = array['search_path=""']::text[]),3,'the three P15-02 definers pin an empty search path');
select extensions.ok(not exists (
  select 1 from pg_proc as proc
  where proc.oid = 'private.has_clinical_permission_at_branch(uuid,text)'::regprocedure
    and (
      has_function_privilege('public','private.has_clinical_permission_at_branch(uuid,text)','execute')
      or has_function_privilege('anon','private.has_clinical_permission_at_branch(uuid,text)','execute')
      or has_function_privilege('authenticated','private.has_clinical_permission_at_branch(uuid,text)','execute')
      or has_function_privilege('service_role','private.has_clinical_permission_at_branch(uuid,text)','execute')
    )
),'the clinical permission helper reused by P15-02 stays revoked from every browser and service role');
select extensions.ok(
  private.audit_metadata_is_safe('{"reason":"Corrected diagnosis."}'::jsonb)
  and not private.audit_metadata_is_safe('{"reason":42}'::jsonb)
  and not private.audit_metadata_is_safe('{"reason":""}'::jsonb),
  'the audit metadata allow-list accepts a bounded void reason and rejects non-string or empty values'
);

-- Positive creation across every status and a spread of findings, plus the
-- default whole-tooth path.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.create_tooth_condition('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26','O','ACTIVE','CARIES','Distal caries on 26.')),1,'an ACTIVE CARIES condition is recorded at version one');
select extensions.is((select version from public.create_tooth_condition('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','16','FULL','PLANNED','CROWN','Scheduled crown.')),1,'a PLANNED CROWN condition is recorded at version one');
select extensions.is((select version from public.create_tooth_condition('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','11','M','COMPLETED','RESTORATION',null)),1,'a COMPLETED RESTORATION condition is recorded at version one');
select extensions.is((select version from public.create_tooth_condition('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','48','FULL','REFERRED','MISSING','Referral placed.')),1,'a REFERRED MISSING condition is recorded at version one');
select extensions.is((select version from public.create_tooth_condition('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','31')),1,'the whole-tooth ACTIVE OTHER defaults are applied at version one');
reset role;
insert into p1502_conditions (seq, id) values
  (1, (select id from public.tooth_conditions where organization_id='b7200000-0000-0000-0000-000000000001' and tooth_code='26' and status='ACTIVE' and finding_type='CARIES')),
  (2, (select id from public.tooth_conditions where organization_id='b7200000-0000-0000-0000-000000000001' and tooth_code='16')),
  (3, (select id from public.tooth_conditions where organization_id='b7200000-0000-0000-0000-000000000001' and tooth_code='11')),
  (4, (select id from public.tooth_conditions where organization_id='b7200000-0000-0000-0000-000000000001' and tooth_code='48')),
  (5, (select id from public.tooth_conditions where organization_id='b7200000-0000-0000-0000-000000000001' and tooth_code='31'));
select extensions.is((select count(*)::integer from p1502_conditions),5,'five conditions were created for patient A');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.tooth_condition.created' and patient_id='b7500000-0000-0000-0000-000000000001'),5,'each create writes exactly one clinical.tooth_condition.created audit event');
select extensions.ok((select surface='O' and status='ACTIVE' and finding_type='CARIES' and version=1 and recorded_by='b7100000-0000-0000-0000-000000000001' and notes='Distal caries on 26.' and voided_at is null from public.tooth_conditions where id=(select id from p1502_conditions where seq=1)),'create derives the tenant and persists the bounded condition projection with the actor recorded');

-- Clean invalid-input validation before the table CHECKs fire.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.create_tooth_condition('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','49')$$,'22023','invalid input','an out-of-range FDI tooth code is rejected with a clean error');
select extensions.throws_ok($$select public.create_tooth_condition('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26','X')$$,'22023','invalid input','an unknown surface is rejected with a clean error');
select extensions.throws_ok($$select public.create_tooth_condition('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26','FULL','DONE')$$,'22023','invalid input','an unknown status is rejected with a clean error');
select extensions.throws_ok($$select public.create_tooth_condition('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26','FULL','ACTIVE','ABSCESS')$$,'22023','invalid input','an unknown finding type is rejected with a clean error');
select extensions.throws_ok($$select public.create_tooth_condition('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26','FULL','ACTIVE','OTHER',repeat('n',2001))$$,'22023','invalid input','oversized notes are rejected with a clean error');
select extensions.throws_ok($$select public.create_tooth_condition('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000002','26')$$,'42501','not authorized','a foreign-tenant patient is denied condition creation');
reset role;

-- Permission denials on the write path.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.create_tooth_condition('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26')$$,'42501','not authorized','receptionist without clinical.write cannot create conditions');
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok($$select public.create_tooth_condition('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','26')$$,'42501','not authorized','a read-only dental assistant cannot create conditions');
select extensions.throws_ok($$select public.void_tooth_condition('b7300000-0000-0000-0000-000000000001',(select id from p1502_conditions where seq=1),1)$$,'42501','not authorized','a read-only dental assistant cannot void conditions');
reset role;

-- Void of an ACTIVE condition: history preserved with a version bump + audit.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.void_tooth_condition('b7300000-0000-0000-0000-000000000001',(select id from p1502_conditions where seq=1),1,'Finding corrected.')),2,'voiding an ACTIVE condition bumps its version');
reset role;
select extensions.ok((select voided_at is not null and version=2 and status='ACTIVE' and tooth_code='26' from public.tooth_conditions where id=(select id from p1502_conditions where seq=1)),'void stamps voided_at while preserving the row and its status');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.tooth_condition.voided' and patient_id='b7500000-0000-0000-0000-000000000001' and metadata->>'reason'='Finding corrected.'),1,'void writes exactly one clinical.tooth_condition.voided audit event with the bounded reason');

-- Void of a PLANNED condition without a reason strips the null metadata key.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.is((select version from public.void_tooth_condition('b7300000-0000-0000-0000-000000000001',(select id from p1502_conditions where seq=2),1)),2,'voiding a PLANNED condition bumps its version');
reset role;
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.tooth_condition.voided' and patient_id='b7500000-0000-0000-0000-000000000001' and metadata='{}'::jsonb),1,'a void without a reason audits empty metadata with nulls stripped');

-- Terminal COMPLETED/REFERRED rows are kept as history and refuse voiding.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.void_tooth_condition('b7300000-0000-0000-0000-000000000001',(select id from p1502_conditions where seq=3),1)$$,'P0001','invalid state','a COMPLETED condition refuses voiding as invalid state');
select extensions.throws_ok($$select public.void_tooth_condition('b7300000-0000-0000-0000-000000000001',(select id from p1502_conditions where seq=4),1)$$,'P0001','invalid state','a REFERRED condition refuses voiding as invalid state');
select extensions.throws_ok($$select public.void_tooth_condition('b7300000-0000-0000-0000-000000000001',(select id from p1502_conditions where seq=1),1)$$,'P0001','stale version','voiding with a stale version is rejected');
select extensions.throws_ok($$select public.void_tooth_condition('b7300000-0000-0000-0000-000000000001',(select id from p1502_conditions where seq=1),99,repeat('r',501))$$,'22023','invalid input','a reason longer than 500 characters is rejected');
reset role;
select extensions.ok((select status='COMPLETED' and voided_at is null and version=1 from public.tooth_conditions where id=(select id from p1502_conditions where seq=3)),'the COMPLETED row is preserved untouched as history');
select extensions.ok((select status='REFERRED' and voided_at is null and version=1 from public.tooth_conditions where id=(select id from p1502_conditions where seq=4)),'the REFERRED row is preserved untouched as history');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.tooth_condition.voided' and patient_id='b7500000-0000-0000-0000-000000000001'),2,'only the two valid voids produced voided audits');

-- Reads: the assistant may list, history is opt-in, and reads write no audits.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000002',true);
select extensions.is((select count(*)::integer from public.list_tooth_conditions('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',false)),3,'a read-only assistant can list only the non-voided conditions by default');
select extensions.is((select count(*)::integer from public.list_tooth_conditions('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',true)),5,'history mode includes the voided conditions');
select extensions.is((select tooth_code from public.list_tooth_conditions('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',false) where condition_id=(select id from p1502_conditions where seq=3)),'11','list projects the bounded condition fields');
select extensions.ok((select status='ACTIVE' and finding_type='CARIES' and voided_at is not null and version=2 and recorded_by='b7100000-0000-0000-0000-000000000001' from public.list_tooth_conditions('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',true) where condition_id=(select id from p1502_conditions where seq=1)),'the voided condition remains queryable as preserved history in history mode');
select extensions.ok(not exists (select 1 from public.list_tooth_conditions('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',false) where voided_at is not null),'default listing never returns voided rows');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.list_tooth_conditions('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001',false)$$,'42501','not authorized','receptionist without clinical.read cannot list conditions');
reset role;

-- Tenant isolation: the foreign dentist can work only inside their own tenant.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000005',true);
select extensions.is((select version from public.create_tooth_condition('b7300000-0000-0000-0000-000000000003','b7500000-0000-0000-0000-000000000002','37')),1,'the foreign dentist records a condition inside tenant B');
select extensions.throws_ok($$select public.create_tooth_condition('b7300000-0000-0000-0000-000000000003','b7500000-0000-0000-0000-000000000001','26')$$,'42501','not authorized','a foreign dentist cannot create conditions on another tenant patient');
select extensions.throws_ok($$select public.list_tooth_conditions('b7300000-0000-0000-0000-000000000003','b7500000-0000-0000-0000-000000000001',true)$$,'42501','not authorized','a foreign dentist cannot list another tenant conditions');
reset role;
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000002' and action='clinical.tooth_condition.created' and patient_id='b7500000-0000-0000-0000-000000000002'),1,'tenant B condition creation audits inside tenant B only');
-- The immediately preceding tenant-specific assertions prove the intended 5/1
-- fixture distribution. Do not assert a global audit count: the guarded local
-- stack preserves synthetic history across forward-only migration checks.

-- Exactly-one-audit-per-mutation and audit-rollback (blocked audit rolls back).
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.tooth_condition.created' and patient_id='b7500000-0000-0000-0000-000000000001'),5,'exactly five created audits for the five patient A conditions');
create function private.p1502_block_tooth_condition_audit() returns trigger language plpgsql as $$begin if new.action = 'clinical.tooth_condition.created' then raise exception using errcode = 'P0001', message = 'audit blocked'; end if; return new; end;$$;
create trigger p1502_block_tooth_condition_audit before insert on public.audit_events for each row execute function private.p1502_block_tooth_condition_audit();
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','b7100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok($$select public.create_tooth_condition('b7300000-0000-0000-0000-000000000001','b7500000-0000-0000-0000-000000000001','46','FULL','ACTIVE','CARIES','Rollback probe')$$,'P0001','audit blocked','a failing clinical.tooth_condition.created audit event rejects the condition');
reset role;
select extensions.ok(not exists (select 1 from public.tooth_conditions where organization_id='b7200000-0000-0000-0000-000000000001' and notes='Rollback probe'),'a blocked audit rolls back the new condition row entirely');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='b7200000-0000-0000-0000-000000000001' and action='clinical.tooth_condition.created' and patient_id='b7500000-0000-0000-0000-000000000001'),5,'a blocked audit rolls back its own audit row, leaving five created audits');
drop trigger p1502_block_tooth_condition_audit on public.audit_events;
drop function private.p1502_block_tooth_condition_audit();

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
