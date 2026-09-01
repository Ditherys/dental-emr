begin;

select extensions.no_plan();

-- Synthetic-only Task 5 graph for the visit-bound clinical record composer.
-- Organization A holds a dentist with an active linked provider at A Main, an
-- owner with no provider link, and a receptionist. Organization B is foreign.
-- Fixture inserts run as postgres; every RPC call runs with set local role
-- authenticated plus the request jwt claim.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('e3100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@crc.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e3100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-plain-a@crc.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e3100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception-a@crc.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e3100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@crc.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('e3200000-0000-0000-0000-000000000001','CRC Synthetic A Inc.','CRC A','crc-a'),
  ('e3200000-0000-0000-0000-000000000002','CRC Synthetic B Inc.','CRC B','crc-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('e3300000-0000-0000-0000-000000000001','e3200000-0000-0000-0000-000000000001','CRC A Main','crc-a-main','CRC-A','1 Synthetic St','Test City','Test Province'),
  ('e3300000-0000-0000-0000-000000000002','e3200000-0000-0000-0000-000000000001','CRC A Branch 2','crc-a-2','CRC-A2','2 Synthetic St','Test City','Test Province'),
  ('e3300000-0000-0000-0000-000000000003','e3200000-0000-0000-0000-000000000002','CRC B Main','crc-b-main','CRC-B','3 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('e3400000-0000-0000-0000-000000000001','e3200000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('e3400000-0000-0000-0000-000000000002','e3200000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('e3400000-0000-0000-0000-000000000003','e3200000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('e3400000-0000-0000-0000-000000000004','e3200000-0000-0000-0000-000000000002','e3100000-0000-0000-0000-000000000004','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('e3200000-0000-0000-0000-000000000001','e3300000-0000-0000-0000-000000000001','e3400000-0000-0000-0000-000000000001','active'),
  ('e3200000-0000-0000-0000-000000000001','e3300000-0000-0000-0000-000000000002','e3400000-0000-0000-0000-000000000001','active'),
  ('e3200000-0000-0000-0000-000000000001','e3300000-0000-0000-0000-000000000001','e3400000-0000-0000-0000-000000000002','active'),
  ('e3200000-0000-0000-0000-000000000001','e3300000-0000-0000-0000-000000000001','e3400000-0000-0000-0000-000000000003','active'),
  ('e3200000-0000-0000-0000-000000000002','e3300000-0000-0000-0000-000000000003','e3400000-0000-0000-0000-000000000004','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('e3200000-0000-0000-0000-000000000001'::uuid,'e3400000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'e3100000-0000-0000-0000-000000000001'::uuid),
  ('e3200000-0000-0000-0000-000000000001'::uuid,'e3400000-0000-0000-0000-000000000002'::uuid,'OWNER'::text,null::uuid,'e3100000-0000-0000-0000-000000000002'::uuid),
  ('e3200000-0000-0000-0000-000000000001'::uuid,'e3400000-0000-0000-0000-000000000003'::uuid,'RECEPTIONIST'::text,'e3300000-0000-0000-0000-000000000001'::uuid,'e3100000-0000-0000-0000-000000000001'::uuid),
  ('e3200000-0000-0000-0000-000000000002'::uuid,'e3400000-0000-0000-0000-000000000004'::uuid,'DENTIST'::text,null::uuid,'e3100000-0000-0000-0000-000000000004'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('e3500000-0000-0000-0000-000000000001','e3200000-0000-0000-0000-000000000001','CRC-A-1','Patient','A1',date '1990-01-01','e3300000-0000-0000-0000-000000000001'),
  ('e3500000-0000-0000-0000-000000000002','e3200000-0000-0000-0000-000000000001','CRC-A-2','Patient','A2',date '1991-02-02','e3300000-0000-0000-0000-000000000001'),
  ('e3500000-0000-0000-0000-000000000003','e3200000-0000-0000-0000-000000000002','CRC-B-1','Patient','B1',date '1992-03-03',null);
insert into public.providers (id, organization_id, linked_user_id, first_name, last_name, provider_type, status) values
  ('e3600000-0000-0000-0000-000000000001','e3200000-0000-0000-0000-000000000001','e3100000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active'),
  ('e3600000-0000-0000-0000-000000000002','e3200000-0000-0000-0000-000000000002','e3100000-0000-0000-0000-000000000004','Dentist','B1','REGULAR','active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('e3200000-0000-0000-0000-000000000001','e3600000-0000-0000-0000-000000000001','e3300000-0000-0000-0000-000000000001',true),
  ('e3200000-0000-0000-0000-000000000002','e3600000-0000-0000-0000-000000000002','e3300000-0000-0000-0000-000000000003',true);

create temp table crc_findings (
  seq integer primary key,
  patient_id uuid,
  encounter_id uuid,
  clinical_date date,
  recorded_count integer
);
create temp table crc_notes (
  seq integer primary key,
  patient_id uuid,
  encounter_id uuid,
  note_id uuid,
  version integer
);
grant select, insert on crc_findings to authenticated;
grant select, insert on crc_notes to authenticated;

-- Browser boundary.
select extensions.ok(
  has_function_privilege('authenticated','public.record_visit_tooth_findings(uuid,uuid,text[],text,text[],text,date,text,uuid)','execute')
  and not has_function_privilege('anon','public.record_visit_tooth_findings(uuid,uuid,text[],text,text[],text,date,text,uuid)','execute')
  and not has_function_privilege('service_role','public.record_visit_tooth_findings(uuid,uuid,text[],text,text[],text,date,text,uuid)','execute')
  and not has_function_privilege('public','public.record_visit_tooth_findings(uuid,uuid,text[],text,text[],text,date,text,uuid)','execute'),
  'only authenticated may execute the visit-bound finding composer'
);
select extensions.ok(
  has_function_privilege('authenticated','public.record_visit_clinical_note(uuid,uuid,text,text,uuid)','execute')
  and not has_function_privilege('anon','public.record_visit_clinical_note(uuid,uuid,text,text,uuid)','execute')
  and not has_function_privilege('service_role','public.record_visit_clinical_note(uuid,uuid,text,text,uuid)','execute')
  and not has_function_privilege('public','public.record_visit_clinical_note(uuid,uuid,text,text,uuid)','execute'),
  'only authenticated may execute the visit-bound note composer'
);
select extensions.ok(
  (select bool_and(proc.prosecdef and proc.proconfig = array['search_path=""']::text[])
   from pg_proc as proc
   where proc.oid in (
     'public.record_visit_tooth_findings(uuid,uuid,text[],text,text[],text,date,text,uuid)'::regprocedure,
     'public.record_visit_clinical_note(uuid,uuid,text,text,uuid)'::regprocedure
   )),
  'both composer RPCs are SECURITY DEFINER with an empty search path'
);

-- The superseded direct entry path can omit encounter and provider attribution,
-- so the browser may no longer reach it.
select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.record_tooth_clinical_entry_v3(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text)',
    'execute'
  ),
  'the superseded provider-free direct entry path is revoked from authenticated'
);
select extensions.is(
  (select count(*)::integer
   from pg_proc as proc
   join pg_namespace as namespace on namespace.oid = proc.pronamespace
   where namespace.nspname = 'public'
     and proc.prosrc ~* 'insert into public\.tooth_clinical_entries'
     and proc.prosrc ~* 'start_or_resume_clinical_visit'
     and has_function_privilege('authenticated', proc.oid, 'execute')),
  1,
  'exactly one browser-reachable path records a tooth entry bound to the managed visit'
);

-- Positive path: one dentist records a two-tooth surface finding.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e3100000-0000-0000-0000-000000000001',true);
insert into crc_findings (seq, patient_id, encounter_id, clinical_date, recorded_count)
select 1, result.patient_id, result.encounter_id, result.clinical_date, result.recorded_count
from public.record_visit_tooth_findings(
  'e3300000-0000-0000-0000-000000000001',
  'e3500000-0000-0000-0000-000000000001',
  array['16','17'],
  'CARIES',
  array['O','M'],
  'ACTIVE',
  (timezone('Asia/Manila', statement_timestamp()))::date,
  'Synthetic occlusal caries',
  'e3900000-0000-0000-0000-000000000001'
) as result;
reset role;

select extensions.ok(
  (select recorded_count = 2 and patient_id = 'e3500000-0000-0000-0000-000000000001'
     and clinical_date = (timezone('Asia/Manila', statement_timestamp()))::date
   from crc_findings where seq = 1),
  'the composer records one canonical entry per selected tooth and reports the server clinical date'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries
   where organization_id = 'e3200000-0000-0000-0000-000000000001'
     and patient_id = 'e3500000-0000-0000-0000-000000000001'),
  2,
  'exactly two canonical clinical entries exist for the selected teeth'
);
select extensions.ok(
  (select bool_and(
      entry.kind = 'FINDING'
      and entry.clinical_code = 'CARIES'
      and entry.status = 'ACTIVE'
      and entry.lifecycle = 'OPEN'
      and entry.provenance = 'INTERNAL'
      and entry.treating_provider_id = 'e3600000-0000-0000-0000-000000000001'
      and entry.recorded_by = 'e3100000-0000-0000-0000-000000000001'
      and entry.encounter_id = (select encounter_id from crc_findings where seq = 1))
   from public.tooth_clinical_entries as entry
   where entry.organization_id = 'e3200000-0000-0000-0000-000000000001'
     and entry.patient_id = 'e3500000-0000-0000-0000-000000000001'),
  'every recorded entry is bound to the managed visit and to the server-derived treating provider'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entry_surfaces as surface
   join public.tooth_clinical_entries as entry
     on entry.organization_id = surface.organization_id and entry.id = surface.entry_id
   where entry.patient_id = 'e3500000-0000-0000-0000-000000000001'
     and surface.surface in ('O','M')),
  4,
  'each recorded entry carries both requested surfaces'
);
select extensions.ok(
  (select encounter.managed_visit and encounter.status = 'OPEN'
     and encounter.treating_provider_id = 'e3600000-0000-0000-0000-000000000001'
     and encounter.clinical_date = (timezone('Asia/Manila', statement_timestamp()))::date
   from public.clinical_encounters as encounter
   where encounter.id = (select encounter_id from crc_findings where seq = 1)),
  'the composer bound its write to one managed OPEN visit derived entirely on the server'
);
select extensions.is(
  (select count(*)::integer from public.clinical_encounters
   where organization_id = 'e3200000-0000-0000-0000-000000000001'),
  1,
  'recording a multi-tooth finding opens exactly one managed visit'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
   where organization_id = 'e3200000-0000-0000-0000-000000000001'
     and action = 'clinical.tooth_entry.recorded'),
  2,
  'each canonical entry appends its own attributable audit event'
);
select extensions.is(
  (select count(*)::integer from public.audit_events
   where organization_id = 'e3200000-0000-0000-0000-000000000001'
     and action = 'clinical.encounter.opened'),
  1,
  'the managed visit audits its creation exactly once'
);

-- Duplicate submission: the same request key must not double-record.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e3100000-0000-0000-0000-000000000001',true);
insert into crc_findings (seq, patient_id, encounter_id, clinical_date, recorded_count)
select 2, result.patient_id, result.encounter_id, result.clinical_date, result.recorded_count
from public.record_visit_tooth_findings(
  'e3300000-0000-0000-0000-000000000001',
  'e3500000-0000-0000-0000-000000000001',
  array['16','17'],
  'CARIES',
  array['O','M'],
  'ACTIVE',
  (timezone('Asia/Manila', statement_timestamp()))::date,
  'Synthetic occlusal caries',
  'e3900000-0000-0000-0000-000000000001'
) as result;
reset role;
select extensions.ok(
  (select second.encounter_id = first.encounter_id and second.recorded_count = first.recorded_count
   from crc_findings as first, crc_findings as second
   where first.seq = 1 and second.seq = 2),
  'a duplicate submission replays the original result instead of recording again'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries
   where organization_id = 'e3200000-0000-0000-0000-000000000001'),
  2,
  'a duplicate submission creates no additional canonical entry'
);

-- Bounded note creation under the same managed visit.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e3100000-0000-0000-0000-000000000001',true);
insert into crc_notes (seq, patient_id, encounter_id, note_id, version)
select 1, result.patient_id, result.encounter_id, result.note_id, result.version
from public.record_visit_clinical_note(
  'e3300000-0000-0000-0000-000000000001',
  'e3500000-0000-0000-0000-000000000001',
  'PROGRESS',
  'Synthetic visit note',
  'e3900000-0000-0000-0000-000000000002'
) as result;
reset role;
select extensions.ok(
  (select note.encounter_id = (select encounter_id from crc_findings where seq = 1)
     and note.status = 'DRAFT'
     and note.note_type = 'PROGRESS'
     and note.parent_note_id is null
     and note.created_by = 'e3100000-0000-0000-0000-000000000001'
   from public.clinical_notes as note
   where note.id = (select note_id from crc_notes where seq = 1)),
  'the composer note is authored as a DRAFT under the same managed visit'
);
select extensions.is(
  (select count(*)::integer from public.clinical_encounters
   where organization_id = 'e3200000-0000-0000-0000-000000000001'),
  1,
  'recording a note resumes the managed visit rather than opening a second one'
);

-- A duplicate note submission replays the first note.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e3100000-0000-0000-0000-000000000001',true);
insert into crc_notes (seq, patient_id, encounter_id, note_id, version)
select 2, result.patient_id, result.encounter_id, result.note_id, result.version
from public.record_visit_clinical_note(
  'e3300000-0000-0000-0000-000000000001',
  'e3500000-0000-0000-0000-000000000001',
  'PROGRESS',
  'Synthetic visit note',
  'e3900000-0000-0000-0000-000000000002'
) as result;
reset role;
select extensions.ok(
  (select second.note_id = first.note_id from crc_notes as first, crc_notes as second
   where first.seq = 1 and second.seq = 2),
  'a duplicate note submission replays the original note instead of authoring a second'
);
select extensions.is(
  (select count(*)::integer from public.clinical_notes
   where organization_id = 'e3200000-0000-0000-0000-000000000001'),
  1,
  'a duplicate note submission creates no additional note row'
);

-- Finalized-note amendment rules are preserved: the composer only ever authors a
-- new DRAFT, so a finalized note is never overwritten in place.
create temp table crc_finalized (seq integer primary key, note_id uuid, version integer);
grant select, insert on crc_finalized to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e3100000-0000-0000-0000-000000000001',true);
insert into crc_finalized (seq, note_id, version)
select 1, finalized.note_id, finalized.version
from public.finalize_clinical_note(
  'e3300000-0000-0000-0000-000000000001',
  (select note_id from crc_notes where seq = 1),
  1
) as finalized;
insert into crc_notes (seq, patient_id, encounter_id, note_id, version)
select 3, result.patient_id, result.encounter_id, result.note_id, result.version
from public.record_visit_clinical_note(
  'e3300000-0000-0000-0000-000000000001',
  'e3500000-0000-0000-0000-000000000001',
  'PROGRESS',
  'Second synthetic visit note',
  'e3900000-0000-0000-0000-000000000003'
) as result;
reset role;
select extensions.ok(
  (select note.status = 'FINALIZED' and note.content = 'Synthetic visit note'
   from public.clinical_notes as note
   where note.id = (select note_id from crc_notes where seq = 1)),
  'a finalized note keeps its finalized content when the composer authors another note'
);
select extensions.ok(
  (select third.note_id <> first.note_id from crc_notes as first, crc_notes as third
   where first.seq = 1 and third.seq = 3),
  'the composer authors a new note rather than mutating the finalized one'
);
select extensions.is(
  (select count(*)::integer from public.clinical_notes
   where organization_id = 'e3200000-0000-0000-0000-000000000001' and note_type = 'AMENDMENT'),
  0,
  'the composer never creates an amendment; the existing correction path still owns that'
);

-- Domain validation inside the transaction.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e3100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok(
  $$select * from public.record_visit_tooth_findings('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000002',array['11'],'CARIES',array['O'],'ACTIVE',(timezone('Asia/Manila', statement_timestamp()))::date,null,'e3900000-0000-0000-0000-000000000011')$$,
  '22023','invalid input','an occlusal surface on an anterior tooth is refused'
);
select extensions.throws_ok(
  $$select * from public.record_visit_tooth_findings('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000002',array['16'],'CARIES',array['I'],'ACTIVE',(timezone('Asia/Manila', statement_timestamp()))::date,null,'e3900000-0000-0000-0000-000000000012')$$,
  '22023','invalid input','an incisal surface on a posterior tooth is refused'
);
select extensions.throws_ok(
  $$select * from public.record_visit_tooth_findings('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000002',array['16'],'MISSING',array['O'],'ACTIVE',(timezone('Asia/Manila', statement_timestamp()))::date,null,'e3900000-0000-0000-0000-000000000013')$$,
  '22023','invalid input','a whole-tooth finding may not claim a surface'
);
select extensions.throws_ok(
  $$select * from public.record_visit_tooth_findings('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000002',array['16'],'CARIES',array[]::text[],'ACTIVE',(timezone('Asia/Manila', statement_timestamp()))::date,null,'e3900000-0000-0000-0000-000000000014')$$,
  '22023','invalid input','a surface finding must name at least one surface'
);
select extensions.throws_ok(
  $$select * from public.record_visit_tooth_findings('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000002',array['16'],'CARIES',array['O'],'ACTIVE',(timezone('Asia/Manila', statement_timestamp()))::date + 1,null,'e3900000-0000-0000-0000-000000000015')$$,
  '22023','invalid input','a clinical date after the server clinical date is refused'
);
select extensions.throws_ok(
  $$select * from public.record_visit_tooth_findings('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000002',array['16'],'BRIDGE',array['O'],'ACTIVE',(timezone('Asia/Manila', statement_timestamp()))::date,null,'e3900000-0000-0000-0000-000000000016')$$,
  '22023','invalid input','a relationship-owned code is refused by the finding composer'
);
select extensions.throws_ok(
  $$select * from public.record_visit_tooth_findings('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000002',array['16'],'CARIES',array['O'],'PLANNED',(timezone('Asia/Manila', statement_timestamp()))::date,null,'e3900000-0000-0000-0000-000000000017')$$,
  '22023','invalid input','the finding composer records ACTIVE findings only'
);
select extensions.throws_ok(
  $$select * from public.record_visit_tooth_findings('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000002',array['16','16'],'CARIES',array['O'],'ACTIVE',(timezone('Asia/Manila', statement_timestamp()))::date,null,'e3900000-0000-0000-0000-000000000018')$$,
  '22023','invalid input','a duplicated tooth in one submission is refused'
);
select extensions.throws_ok(
  $$select * from public.record_visit_clinical_note('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000002','AMENDMENT','Synthetic','e3900000-0000-0000-0000-000000000019')$$,
  '22023','invalid input','the composer note may not claim the amendment type'
);
select extensions.throws_ok(
  $$select * from public.record_visit_clinical_note('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000002','PROGRESS','   ','e3900000-0000-0000-0000-000000000020')$$,
  '22023','invalid input','an empty composer note is refused'
);
reset role;

-- Negative authorization.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e3100000-0000-0000-0000-000000000003',true);
select extensions.throws_ok(
  $$select * from public.record_visit_tooth_findings('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000001',array['16'],'CARIES',array['O'],'ACTIVE',(timezone('Asia/Manila', statement_timestamp()))::date,null,'e3900000-0000-0000-0000-000000000021')$$,
  '42501','not authorized','a receptionist may not record a clinical finding'
);
select extensions.throws_ok(
  $$select * from public.record_visit_clinical_note('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000001','PROGRESS','Synthetic','e3900000-0000-0000-0000-000000000022')$$,
  '42501','not authorized','a receptionist may not record a clinical note'
);
select set_config('request.jwt.claim.sub','e3100000-0000-0000-0000-000000000002',true);
select extensions.throws_ok(
  $$select * from public.record_visit_tooth_findings('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000001',array['16'],'CARIES',array['O'],'ACTIVE',(timezone('Asia/Manila', statement_timestamp()))::date,null,'e3900000-0000-0000-0000-000000000023')$$,
  '42501','not authorized','an owner with no active provider link may not treat'
);
select extensions.throws_ok(
  $$select * from public.record_visit_clinical_note('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000001','PROGRESS','Synthetic','e3900000-0000-0000-0000-000000000024')$$,
  '42501','not authorized','an owner with no active provider link may not author a visit note'
);
select set_config('request.jwt.claim.sub','e3100000-0000-0000-0000-000000000001',true);
select extensions.throws_ok(
  $$select * from public.record_visit_tooth_findings('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000003',array['16'],'CARIES',array['O'],'ACTIVE',(timezone('Asia/Manila', statement_timestamp()))::date,null,'e3900000-0000-0000-0000-000000000025')$$,
  '42501','not authorized','a cross-tenant patient identifier is refused'
);
select extensions.throws_ok(
  $$select * from public.record_visit_tooth_findings('e3300000-0000-0000-0000-000000000002','e3500000-0000-0000-0000-000000000001',array['16'],'CARIES',array['O'],'ACTIVE',(timezone('Asia/Manila', statement_timestamp()))::date,null,'e3900000-0000-0000-0000-000000000026')$$,
  '42501','not authorized','a dentist whose provider is not active at the acting branch is refused'
);
select set_config('request.jwt.claim.sub','e3100000-0000-0000-0000-000000000004',true);
select extensions.throws_ok(
  $$select * from public.record_visit_tooth_findings('e3300000-0000-0000-0000-000000000001','e3500000-0000-0000-0000-000000000001',array['16'],'CARIES',array['O'],'ACTIVE',(timezone('Asia/Manila', statement_timestamp()))::date,null,'e3900000-0000-0000-0000-000000000027')$$,
  '42501','not authorized','a foreign-tenant dentist may not record at another organization branch'
);
reset role;

-- No refused attempt left clinical state behind.
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries
   where organization_id = 'e3200000-0000-0000-0000-000000000001'),
  2,
  'every refused submission left the canonical record untouched'
);
select extensions.is(
  (select count(*)::integer from public.clinical_encounters
   where organization_id = 'e3200000-0000-0000-0000-000000000001'),
  1,
  'a refused submission never leaves an orphan managed visit behind'
);
select extensions.is(
  (select count(*)::integer from public.tooth_clinical_entries
   where organization_id = 'e3200000-0000-0000-0000-000000000002'),
  0,
  'the foreign tenant recorded nothing'
);

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
