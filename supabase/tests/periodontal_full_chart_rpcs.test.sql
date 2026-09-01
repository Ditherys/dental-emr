-- Unified Clinical Chart workspace, task 11: the versioned periodontal
-- examination workflows.
--
-- Everything below is deterministic synthetic local fixture data. No real
-- patient, provider, or credential value appears in this file.
--
-- The suite covers, in order:
--    1. the browser boundary: narrow execute grants and definer posture;
--    2. negative authorization on every write boundary, including the
--       cross-actor finalize that task 9's suite did not reach;
--    3. idempotent draft creation with an automatically started managed visit;
--    4. batch autosave: shape and size bounds, exactly-once version increment,
--       a stale expected_version that overwrites nothing, unknown preserved as
--       NULL, no-op batches that write nothing, and peri-implant write order;
--    5. trusted finalization: server-recomputed classification, completeness,
--       the override reason, and both fingerprints;
--    6. amendment: adoption of a pre-existing reason-less DRAFT successor;
--    7. the workspace and comparison projections.

begin;

select extensions.no_plan();

-- ---------------------------------------------------------------------------
-- Synthetic graph
--
-- Organization A holds a dentist with an active linked provider at A Main, an
-- owner with an active linked provider at A Main (the only actor who may
-- amend), an owner with no provider link at all, and a receptionist.
-- Organization B is foreign.
-- ---------------------------------------------------------------------------

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('ea100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','perio-rpc-dentist-a@pfr.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('ea100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','perio-rpc-owner-provider-a@pfr.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('ea100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','perio-rpc-owner-plain-a@pfr.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('ea100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','perio-rpc-reception-a@pfr.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('ea100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','perio-rpc-dentist-b@pfr.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());

insert into public.organizations (id, legal_name, business_name, slug) values
  ('ea200000-0000-0000-0000-000000000001','PFR Synthetic A Inc.','PFR A','pfr-a'),
  ('ea200000-0000-0000-0000-000000000002','PFR Synthetic B Inc.','PFR B','pfr-b');

insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('ea300000-0000-0000-0000-000000000001','ea200000-0000-0000-0000-000000000001','PFR A Main','pfr-a-main','PFR-A','1 Synthetic St','Test City','Test Province'),
  ('ea300000-0000-0000-0000-000000000002','ea200000-0000-0000-0000-000000000002','PFR B Main','pfr-b-main','PFR-B','2 Synthetic St','Test City','Test Province');

insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('ea400000-0000-0000-0000-000000000001','ea200000-0000-0000-0000-000000000001','ea100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('ea400000-0000-0000-0000-000000000002','ea200000-0000-0000-0000-000000000001','ea100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('ea400000-0000-0000-0000-000000000003','ea200000-0000-0000-0000-000000000001','ea100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('ea400000-0000-0000-0000-000000000004','ea200000-0000-0000-0000-000000000001','ea100000-0000-0000-0000-000000000004','active',statement_timestamp()),
  ('ea400000-0000-0000-0000-000000000005','ea200000-0000-0000-0000-000000000002','ea100000-0000-0000-0000-000000000005','active',statement_timestamp());

insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('ea200000-0000-0000-0000-000000000001','ea300000-0000-0000-0000-000000000001','ea400000-0000-0000-0000-000000000001','active'),
  ('ea200000-0000-0000-0000-000000000001','ea300000-0000-0000-0000-000000000001','ea400000-0000-0000-0000-000000000002','active'),
  ('ea200000-0000-0000-0000-000000000001','ea300000-0000-0000-0000-000000000001','ea400000-0000-0000-0000-000000000003','active'),
  ('ea200000-0000-0000-0000-000000000001','ea300000-0000-0000-0000-000000000001','ea400000-0000-0000-0000-000000000004','active'),
  ('ea200000-0000-0000-0000-000000000002','ea300000-0000-0000-0000-000000000002','ea400000-0000-0000-0000-000000000005','active');

insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('ea200000-0000-0000-0000-000000000001'::uuid,'ea400000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'ea100000-0000-0000-0000-000000000001'::uuid),
  ('ea200000-0000-0000-0000-000000000001'::uuid,'ea400000-0000-0000-0000-000000000002'::uuid,'OWNER'::text,null::uuid,'ea100000-0000-0000-0000-000000000002'::uuid),
  ('ea200000-0000-0000-0000-000000000001'::uuid,'ea400000-0000-0000-0000-000000000003'::uuid,'OWNER'::text,null::uuid,'ea100000-0000-0000-0000-000000000003'::uuid),
  ('ea200000-0000-0000-0000-000000000001'::uuid,'ea400000-0000-0000-0000-000000000004'::uuid,'RECEPTIONIST'::text,'ea300000-0000-0000-0000-000000000001'::uuid,'ea100000-0000-0000-0000-000000000001'::uuid),
  ('ea200000-0000-0000-0000-000000000002'::uuid,'ea400000-0000-0000-0000-000000000005'::uuid,'DENTIST'::text,null::uuid,'ea100000-0000-0000-0000-000000000005'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;

insert into public.providers (id, organization_id, linked_user_id, first_name, last_name, provider_type, status) values
  ('ea600000-0000-0000-0000-000000000001','ea200000-0000-0000-0000-000000000001','ea100000-0000-0000-0000-000000000001','Provider','A','REGULAR','active'),
  ('ea600000-0000-0000-0000-000000000002','ea200000-0000-0000-0000-000000000001','ea100000-0000-0000-0000-000000000002','Owner','Treating','REGULAR','active'),
  ('ea600000-0000-0000-0000-000000000003','ea200000-0000-0000-0000-000000000002','ea100000-0000-0000-0000-000000000005','Provider','B','REGULAR','active');

insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('ea200000-0000-0000-0000-000000000001','ea600000-0000-0000-0000-000000000001','ea300000-0000-0000-0000-000000000001',true),
  ('ea200000-0000-0000-0000-000000000001','ea600000-0000-0000-0000-000000000002','ea300000-0000-0000-0000-000000000001',true),
  ('ea200000-0000-0000-0000-000000000002','ea600000-0000-0000-0000-000000000003','ea300000-0000-0000-0000-000000000002',true);

insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('ea500000-0000-0000-0000-000000000001','ea200000-0000-0000-0000-000000000001','PFR-A-1','Patient','A1',date '1985-01-01','ea300000-0000-0000-0000-000000000001'),
  ('ea500000-0000-0000-0000-000000000003','ea200000-0000-0000-0000-000000000001','PFR-A-2','Patient','A2',date '1987-03-03','ea300000-0000-0000-0000-000000000001'),
  ('ea500000-0000-0000-0000-000000000002','ea200000-0000-0000-0000-000000000002','PFR-B-1','Patient','B1',date '1986-02-02','ea300000-0000-0000-0000-000000000002');

create temporary table perio_rpc_scratch (
  label text primary key,
  examination_id uuid,
  encounter_id uuid,
  version integer
) on commit drop;

-- The suite calls the boundaries as `authenticated`, so the scratch table that
-- carries the server-issued identities between statements is readable and
-- writable by that role. It holds identities only, never measurement content.
grant all on perio_rpc_scratch to authenticated;

-- ===========================================================================
-- 1. The browser boundary
-- ===========================================================================

select extensions.ok(
  has_function_privilege('authenticated','public.create_periodontal_draft_v2(uuid,uuid,text,timestamptz,uuid)','execute')
  and has_function_privilege('authenticated','public.save_periodontal_measurements_v2(uuid,integer,jsonb,uuid)','execute')
  and has_function_privilege('authenticated','public.finalize_periodontal_examination_v2(uuid,integer,jsonb,uuid)','execute')
  and has_function_privilege('authenticated','public.amend_periodontal_examination_v2(uuid,text,uuid)','execute')
  and has_function_privilege('authenticated','public.get_periodontal_workspace_v2(uuid,uuid,uuid)','execute')
  and has_function_privilege('authenticated','public.compare_periodontal_examinations_v2(uuid,uuid,uuid,uuid)','execute'),
  'authenticated receives every task 11 periodontal boundary'
);

select extensions.ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as p
    join pg_catalog.pg_namespace as n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'create_periodontal_draft_v2','save_periodontal_measurements_v2',
        'finalize_periodontal_examination_v2','amend_periodontal_examination_v2',
        'get_periodontal_workspace_v2','compare_periodontal_examinations_v2'
      )
      and (
        not p.prosecdef
        or p.proconfig is distinct from array['search_path=""']::text[]
        or has_function_privilege('public', p.oid, 'execute')
        or has_function_privilege('anon', p.oid, 'execute')
        or has_function_privilege('service_role', p.oid, 'execute')
      )
  ),
  'every task 11 periodontal boundary is SECURITY DEFINER with an empty search path and is denied to public, anon and service_role'
);

select extensions.ok(
  not exists (
    select 1
    from (values
      ('private.periodontal_derived_classification(uuid,uuid)'),
      ('private.periodontal_tooth_reductions(uuid,uuid)'),
      ('private.resolve_actor_provider_at_branch(uuid,uuid,uuid)')
    ) as helper(signature)
    cross join (values ('anon'),('authenticated'),('service_role'),('public')) as role(role_name)
    where has_function_privilege(role.role_name, helper.signature, 'execute')
  ),
  'the task 11 private periodontal helpers are not browser or service callable'
);

-- ===========================================================================
-- 2. Negative authorization on the write boundaries
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000004',true);

select extensions.throws_ok(
  $$select * from public.create_periodontal_draft_v2(
      'ea300000-0000-0000-0000-000000000001'::uuid,
      'ea500000-0000-0000-0000-000000000001'::uuid,
      'INITIAL', null, 'ea900000-0000-0000-0000-000000000001'::uuid)$$,
  '42501','not authorized',
  'a receptionist may not open a periodontal draft'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000003',true);

-- Task 11 inherited requirement 5. private.resolve_actor_provider ignored the
-- acting branch and provider_branches.is_active entirely; the v2 boundary uses
-- private.require_active_actor_provider, so an owner who does not treat at this
-- branch is refused rather than attributed to somebody else.
select extensions.throws_ok(
  $$select * from public.create_periodontal_draft_v2(
      'ea300000-0000-0000-0000-000000000001'::uuid,
      'ea500000-0000-0000-0000-000000000001'::uuid,
      'INITIAL', null, 'ea900000-0000-0000-0000-000000000002'::uuid)$$,
  '42501','not authorized',
  'an owner with no active provider link at the acting branch may not open a periodontal draft'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000005',true);

select extensions.throws_ok(
  $$select * from public.create_periodontal_draft_v2(
      'ea300000-0000-0000-0000-000000000001'::uuid,
      'ea500000-0000-0000-0000-000000000001'::uuid,
      'INITIAL', null, 'ea900000-0000-0000-0000-000000000003'::uuid)$$,
  '42501','not authorized',
  'a dentist from another organization may not open a periodontal draft at a foreign branch'
);

reset role;

-- ===========================================================================
-- 3. Idempotent draft creation with an automatic managed visit
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

insert into perio_rpc_scratch (label, examination_id, encounter_id, version)
select 'draft', draft.examination_id, draft.encounter_id, draft.version
from public.create_periodontal_draft_v2(
  'ea300000-0000-0000-0000-000000000001'::uuid,
  'ea500000-0000-0000-0000-000000000001'::uuid,
  'INITIAL', null, 'ea900000-0000-0000-0000-000000000010'::uuid
) as draft;

reset role;

select extensions.is(
  (select version from perio_rpc_scratch where label = 'draft'),
  1,
  'a newly opened periodontal draft starts at version 1'
);

select extensions.ok(
  (select exam.encounter_id is not null and exam.status = 'DRAFT'
     and exam.examined_provider_id = 'ea600000-0000-0000-0000-000000000001'::uuid
     and exam.examined_by = 'ea100000-0000-0000-0000-000000000001'::uuid
     and exam.examined_at is not null
   from public.periodontal_examinations as exam
   where exam.id = (select examination_id from perio_rpc_scratch where label = 'draft')),
  'the draft is bound to a managed visit and attributed to the signed-in dentist''s own active provider'
);

select extensions.ok(
  (select encounter.managed_visit and encounter.status = 'OPEN'
     and encounter.treating_provider_id = 'ea600000-0000-0000-0000-000000000001'::uuid
   from public.clinical_encounters as encounter
   where encounter.id = (select encounter_id from perio_rpc_scratch where label = 'draft')),
  'opening a periodontal draft started or resumed the managed clinical visit'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.is(
  (select draft.examination_id from public.create_periodontal_draft_v2(
     'ea300000-0000-0000-0000-000000000001'::uuid,
     'ea500000-0000-0000-0000-000000000001'::uuid,
     'INITIAL', null, 'ea900000-0000-0000-0000-000000000010'::uuid) as draft),
  (select examination_id from perio_rpc_scratch where label = 'draft'),
  'a replayed request key returns the original draft instead of opening a second one'
);

select extensions.ok(
  (select draft.resumed from public.create_periodontal_draft_v2(
     'ea300000-0000-0000-0000-000000000001'::uuid,
     'ea500000-0000-0000-0000-000000000001'::uuid,
     'INITIAL', null, 'ea900000-0000-0000-0000-000000000011'::uuid) as draft),
  'a fresh request key on the same visit resumes the open draft rather than forking it'
);

reset role;

select extensions.is(
  (select pg_catalog.count(*)::integer from public.periodontal_examinations as exam
    where exam.organization_id = 'ea200000-0000-0000-0000-000000000001'::uuid
      and exam.patient_id = 'ea500000-0000-0000-0000-000000000001'::uuid),
  1,
  'three draft calls left exactly one periodontal examination'
);

select extensions.is(
  (select pg_catalog.count(*)::integer from public.audit_events as event
    where event.entity_id = (select examination_id from perio_rpc_scratch where label = 'draft')
      and event.action = 'clinical.perio.examination.created'),
  1,
  'opening a draft audits exactly once, replays and resumes included'
);

-- ===========================================================================
-- 4. Batch autosave
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.throws_ok(
  pg_catalog.format(
    $$select * from public.save_periodontal_measurements_v2(%L::uuid, 1,
      jsonb_build_object('sites',
        (select jsonb_agg(jsonb_build_object(
           'tooth_fdi','16','site','B','probing_depth_mm',3))
         from generate_series(1, 201))),
      'ea900000-0000-0000-0000-000000000020'::uuid)$$,
    (select examination_id from perio_rpc_scratch where label = 'draft')),
  '22023','invalid input',
  'an autosave batch above the row bound is refused'
);

select extensions.throws_ok(
  pg_catalog.format(
    $$select * from public.save_periodontal_measurements_v2(%L::uuid, 1,
      '{"sites":[{"tooth_fdi":"16","site":"B","probing_depth_mm":3,"nested":{"deep":1}}]}'::jsonb,
      'ea900000-0000-0000-0000-000000000021'::uuid)$$,
    (select examination_id from perio_rpc_scratch where label = 'draft')),
  '22023','invalid input',
  'an autosave batch carrying a nested object inside a measurement row is refused'
);

select extensions.throws_ok(
  pg_catalog.format(
    $$select * from public.save_periodontal_measurements_v2(%L::uuid, 1,
      '{"sites":[],"unexpected":[]}'::jsonb,
      'ea900000-0000-0000-0000-000000000022'::uuid)$$,
    (select examination_id from perio_rpc_scratch where label = 'draft')),
  '22023','invalid input',
  'an autosave batch carrying an unknown top-level section is refused'
);

-- A partial six-site chart for tooth 16 with the gingival margin deliberately
-- omitted on site DL. Unknown must survive as NULL rather than becoming zero.
select extensions.is(
  (select save.version from public.save_periodontal_measurements_v2(
     (select examination_id from perio_rpc_scratch where label = 'draft'), 1,
     $${"sites":[
        {"tooth_fdi":"16","site":"MB","probing_depth_mm":3,"gingival_margin_mm":0,"bleeding_on_probing":false,"suppuration":false},
        {"tooth_fdi":"16","site":"B","probing_depth_mm":2,"gingival_margin_mm":0,"bleeding_on_probing":false,"suppuration":false},
        {"tooth_fdi":"16","site":"DB","probing_depth_mm":3,"gingival_margin_mm":0,"bleeding_on_probing":true,"suppuration":false},
        {"tooth_fdi":"16","site":"ML","probing_depth_mm":3,"gingival_margin_mm":0,"bleeding_on_probing":false,"suppuration":false},
        {"tooth_fdi":"16","site":"L","probing_depth_mm":2,"gingival_margin_mm":0,"bleeding_on_probing":false,"suppuration":false},
        {"tooth_fdi":"16","site":"DL","probing_depth_mm":3,"bleeding_on_probing":false,"suppuration":false}],
       "plaque":[{"tooth_fdi":"16","surface":"BUCCAL"}],
       "risk":{"age_years_snapshot":40,"smoking_status":"NEVER","diabetes_status":"NONE"}}$$::jsonb,
     'ea900000-0000-0000-0000-000000000023'::uuid) as save),
  2,
  'a successful autosave batch increments the examination version exactly once'
);

reset role;

select extensions.ok(
  (select site.gingival_margin_mm is null and site.cal_mm is null
   from public.periodontal_site_measurements as site
   where site.examination_id = (select examination_id from perio_rpc_scratch where label = 'draft')
     and site.tooth_fdi = '16' and site.site = 'DL'),
  'an omitted gingival margin stays unknown instead of becoming an invented zero'
);

select extensions.ok(
  (select surface.plaque_present is null
   from public.periodontal_plaque_measurements as surface
   where surface.examination_id = (select examination_id from perio_rpc_scratch where label = 'draft')
     and surface.tooth_fdi = '16' and surface.surface = 'BUCCAL'),
  'an omitted plaque assessment stays unknown instead of becoming an invented false'
);

-- Inherited requirement 3. Task 9's reset triggers null the WHOLE
-- classification block on any child UPDATE statement, so a rewrite of six
-- unchanged sites would silently withdraw a clinician's confirmation. A
-- fingerprint is planted here and must survive an identical batch.
update public.periodontal_examinations
set derived_diagnosis = 'HEALTH',
    derived_measurement_fingerprint = private.periodontal_measurement_digest(
      'ea200000-0000-0000-0000-000000000001'::uuid,
      (select examination_id from perio_rpc_scratch where label = 'draft'))
where id = (select examination_id from perio_rpc_scratch where label = 'draft');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.is(
  (select save.saved_sites from public.save_periodontal_measurements_v2(
     (select examination_id from perio_rpc_scratch where label = 'draft'), 2,
     $${"sites":[
        {"tooth_fdi":"16","site":"MB","probing_depth_mm":3,"gingival_margin_mm":0,"bleeding_on_probing":false,"suppuration":false},
        {"tooth_fdi":"16","site":"B","probing_depth_mm":2,"gingival_margin_mm":0,"bleeding_on_probing":false,"suppuration":false}]}$$::jsonb,
     'ea900000-0000-0000-0000-000000000024'::uuid) as save),
  0,
  'an autosave batch that changes nothing reports no written site'
);

reset role;

select extensions.ok(
  (select exam.derived_measurement_fingerprint is not null and exam.derived_diagnosis = 'HEALTH'
   from public.periodontal_examinations as exam
   where exam.id = (select examination_id from perio_rpc_scratch where label = 'draft')),
  'a no-op autosave does not withdraw a standing classification, because it performs no child write at all'
);

-- Inherited requirement 2. The risk inputs are staging and grading
-- determinants and are covered by the measurement digest, so they may never be
-- written in the same UPDATE as a fingerprint: the SET expression sees the
-- pre-update row while the AFTER verification sees the post-update row. The
-- autosave boundary writes risk inputs and the version together and touches no
-- fingerprint, so task 9's BEFORE trigger fires and withdraws the stale
-- classification instead of being silently bypassed.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.is(
  (select save.version from public.save_periodontal_measurements_v2(
     (select examination_id from perio_rpc_scratch where label = 'draft'), 3,
     '{"risk":{"hba1c_percent":8.1,"diabetes_status":"TYPE_2"}}'::jsonb,
     'ea900000-0000-0000-0000-000000000028'::uuid) as save),
  4,
  'a risk-input-only autosave is an ordinary versioned batch'
);

reset role;

select extensions.ok(
  (select exam.hba1c_percent = 8.1 and exam.diabetes_status = 'TYPE_2'
     and exam.derived_diagnosis is null and exam.derived_measurement_fingerprint is null
   from public.periodontal_examinations as exam
   where exam.id = (select examination_id from perio_rpc_scratch where label = 'draft')),
  'changing a staging or grading input withdraws the stale classification, because no fingerprint was written in the same statement'
);

-- A stale expected_version must overwrite nothing.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.throws_ok(
  pg_catalog.format(
    $$select * from public.save_periodontal_measurements_v2(%L::uuid, 1,
      '{"sites":[{"tooth_fdi":"16","site":"MB","probing_depth_mm":9,"gingival_margin_mm":4}]}'::jsonb,
      'ea900000-0000-0000-0000-000000000025'::uuid)$$,
    (select examination_id from perio_rpc_scratch where label = 'draft')),
  'P0001','stale version',
  'a stale expected_version is refused with a typed conflict'
);

reset role;

select extensions.ok(
  (select site.probing_depth_mm = 3 and site.gingival_margin_mm = 0
   from public.periodontal_site_measurements as site
   where site.examination_id = (select examination_id from perio_rpc_scratch where label = 'draft')
     and site.tooth_fdi = '16' and site.site = 'MB'),
  'the stale batch overwrote no newer measurement'
);

-- Inherited requirement 8. The peri-implant index family may only be written
-- once the tooth row records the implant context, so the boundary writes tooth
-- rows before surface rows within one batch. A second DRAFT keeps the
-- peri-implant chart out of the completeness flow below.
insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, examination_kind, status,
  examined_at, examined_by, examined_provider_id
) values (
  'ea800000-0000-0000-0000-00000000000d','ea200000-0000-0000-0000-000000000001',
  'ea500000-0000-0000-0000-000000000001',
  (select encounter_id from perio_rpc_scratch where label = 'draft'),
  'RE-EVALUATION','DRAFT', statement_timestamp(),
  'ea100000-0000-0000-0000-000000000001','ea600000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.is(
  (select save.saved_plaque from public.save_periodontal_measurements_v2(
     'ea800000-0000-0000-0000-00000000000d'::uuid, 1,
     $${"tooth":[{"tooth_fdi":"24","implant_context":true}],
        "plaque":[{"tooth_fdi":"24","surface":"BUCCAL","modified_plaque_index":1,"modified_bleeding_index":0}]}$$::jsonb,
     'ea900000-0000-0000-0000-000000000026'::uuid) as save),
  1,
  'a peri-implant surface index and its implant tooth row are accepted in one batch because the tooth is written first'
);

select extensions.throws_ok(
  $$select * from public.save_periodontal_measurements_v2(
      'ea800000-0000-0000-0000-00000000000d'::uuid, 2,
      '{"plaque":[{"tooth_fdi":"24","surface":"LINGUAL","plaque_index":1}]}'::jsonb,
      'ea900000-0000-0000-0000-000000000027'::uuid)$$,
  '23514','peri-implant surfaces use the modified plaque and bleeding indices',
  'the natural-tooth index family is still refused on a peri-implant surface'
);

reset role;

-- ===========================================================================
-- 5. Trusted finalization
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

-- Tooth 16 site DL still has no gingival margin, so its clinical attachment
-- level is unknown and the examination is not complete.
select extensions.throws_ok(
  pg_catalog.format(
    $$select * from public.finalize_periodontal_examination_v2(%L::uuid, 4,
      '{"diagnosis":"GINGIVITIS"}'::jsonb,
      'ea900000-0000-0000-0000-000000000030'::uuid)$$,
    (select examination_id from perio_rpc_scratch where label = 'draft')),
  'P0001','incomplete examination',
  'an examination with an unknown attachment level cannot be finalized'
);

-- Complete the chart: give the distal-lingual site the gingival margin it was
-- missing, so every present tooth carries six sites with a known attachment
-- level.
select extensions.ok(
  (select save.version = 5 from public.save_periodontal_measurements_v2(
     (select examination_id from perio_rpc_scratch where label = 'draft'), 4,
     $${"sites":[{"tooth_fdi":"16","site":"DL","probing_depth_mm":3,"gingival_margin_mm":0,"bleeding_on_probing":false,"suppuration":false}]}$$::jsonb,
     'ea900000-0000-0000-0000-000000000031'::uuid) as save),
  'completing the chart is an ordinary versioned autosave'
);

-- The derived classification is recomputed server-side. One of six sites bled,
-- which is 16.7 % of assessed sites and therefore gingivitis, and gingivitis is
-- never staged or graded.
select extensions.throws_ok(
  pg_catalog.format(
    $$select * from public.finalize_periodontal_examination_v2(%L::uuid, 5,
      '{"diagnosis":"HEALTH"}'::jsonb,
      'ea900000-0000-0000-0000-000000000032'::uuid)$$,
    (select examination_id from perio_rpc_scratch where label = 'draft')),
  'P0001','override reason required',
  'a confirmed diagnosis that departs from the server-recomputed one is refused without a reason'
);

select extensions.ok(
  (select final.confirmed_diagnosis = 'GINGIVITIS' and final.derived_diagnosis = 'GINGIVITIS'
     and not final.overridden
   from public.finalize_periodontal_examination_v2(
     (select examination_id from perio_rpc_scratch where label = 'draft'), 5,
     '{"diagnosis":"GINGIVITIS"}'::jsonb,
     'ea900000-0000-0000-0000-000000000033'::uuid) as final),
  'finalization recomputes the classification from canonical rows and accepts a confirmation that agrees with it'
);

reset role;

select extensions.ok(
  (select exam.status = 'FINAL' and exam.version = 6
     and exam.finalized_provider_id = 'ea600000-0000-0000-0000-000000000001'::uuid
     and exam.derived_measurement_fingerprint = private.periodontal_measurement_digest(exam.organization_id, exam.id)
     and exam.confirmed_measurement_fingerprint = private.periodontal_measurement_digest(exam.organization_id, exam.id)
     and exam.confirmed_provider_id = 'ea600000-0000-0000-0000-000000000001'::uuid
   from public.periodontal_examinations as exam
   where exam.id = (select examination_id from perio_rpc_scratch where label = 'draft')),
  'the finalized examination stores both fingerprints as the true digest of its own measurements'
);

select extensions.is(
  (select pg_catalog.count(*)::integer from public.audit_events as event
    where event.entity_id = (select examination_id from perio_rpc_scratch where label = 'draft')
      and event.action = 'clinical.perio.examination.finalized'),
  1,
  'finalization audits the transition exactly once'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.throws_ok(
  pg_catalog.format(
    $$select * from public.save_periodontal_measurements_v2(%L::uuid, 6,
      '{"sites":[{"tooth_fdi":"16","site":"MB","probing_depth_mm":9}]}'::jsonb,
      'ea900000-0000-0000-0000-000000000034'::uuid)$$,
    (select examination_id from perio_rpc_scratch where label = 'draft')),
  'P0001','invalid state',
  'a finalized examination refuses further autosave'
);

reset role;

-- Inherited requirement 5, the cross-actor case task 9's suite never reached.
-- An owner with no provider link finalizing a DRAFT another clinician opened is
-- refused outright rather than attributed to that other clinician's provider.
insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, examination_kind, status,
  examined_at, examined_by, examined_provider_id
) values (
  'ea800000-0000-0000-0000-00000000000b','ea200000-0000-0000-0000-000000000001',
  'ea500000-0000-0000-0000-000000000001',
  (select encounter_id from perio_rpc_scratch where label = 'draft'),
  'INITIAL','DRAFT', statement_timestamp(),
  'ea100000-0000-0000-0000-000000000001','ea600000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000003',true);

select extensions.throws_ok(
  $$select * from public.finalize_periodontal_examination_v2(
      'ea800000-0000-0000-0000-00000000000b'::uuid, 1,
      '{"diagnosis":"HEALTH"}'::jsonb,
      'ea900000-0000-0000-0000-000000000035'::uuid)$$,
  '42501','not authorized',
  'an actor with no active provider link may not finalize a draft another clinician opened'
);

reset role;

select extensions.ok(
  (select exam.status = 'DRAFT' and exam.finalized_provider_id is null
   from public.periodontal_examinations as exam
   where exam.id = 'ea800000-0000-0000-0000-00000000000b'),
  'the refused cross-actor finalize attributed the record to nobody'
);

-- ===========================================================================
-- 6. Amendment adopts a pre-existing reason-less DRAFT successor
-- ===========================================================================

-- Exactly the artifact the revoked three-argument amend boundary left behind:
-- a DRAFT successor with no reason, occupying the predecessor's only successor
-- slot. Inserted directly here because that boundary is no longer callable.
insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, predecessor_examination_id,
  examination_kind, status, version, examined_at, examined_by, examined_provider_id
) values (
  'ea800000-0000-0000-0000-00000000000c','ea200000-0000-0000-0000-000000000001',
  'ea500000-0000-0000-0000-000000000001',
  (select encounter_id from perio_rpc_scratch where label = 'draft'),
  (select examination_id from perio_rpc_scratch where label = 'draft'),
  'AMENDMENT','DRAFT', 7, statement_timestamp(),
  'ea100000-0000-0000-0000-000000000001','ea600000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.throws_ok(
  pg_catalog.format(
    $$select * from public.amend_periodontal_examination_v2(%L::uuid,
      'A dentist without the correction permission may not amend.',
      'ea900000-0000-0000-0000-000000000040'::uuid)$$,
    (select examination_id from perio_rpc_scratch where label = 'draft')),
  '42501','not authorized',
  'a dentist without patient.clinical.correct may not amend a finalized periodontal examination'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000002',true);

select extensions.ok(
  (select amendment.examination_id = 'ea800000-0000-0000-0000-00000000000c'::uuid
     and amendment.adopted
   from public.amend_periodontal_examination_v2(
     (select examination_id from perio_rpc_scratch where label = 'draft'),
     'The distal probing depths were transcribed from the wrong quadrant.',
     'ea900000-0000-0000-0000-000000000041'::uuid) as amendment),
  'amending a predecessor whose only successor slot already holds a reason-less DRAFT adopts that DRAFT rather than failing'
);

reset role;

-- Adoption supplies the missing explanation; it does not rewrite the record to
-- claim the adopter took measurements another clinician autosaved into the
-- orphan DRAFT. Authorship stays with whoever charted it, the correction is
-- rebound to the visit it is actually being made in, and the adopter is named
-- as the audit actor.
select extensions.ok(
  (select exam.amendment_reason is not null and exam.status = 'DRAFT'
     and exam.examined_by = 'ea100000-0000-0000-0000-000000000001'::uuid
     and exam.examined_provider_id = 'ea600000-0000-0000-0000-000000000001'::uuid
   from public.periodontal_examinations as exam
   where exam.id = 'ea800000-0000-0000-0000-00000000000c'),
  'the adopted successor gains the bounded amendment reason it never had while keeping the authorship of the clinician who charted it'
);

select extensions.is(
  (select event.metadata ->> 'action'
   from public.audit_events as event
   where event.entity_id = 'ea800000-0000-0000-0000-00000000000c'
     and event.action = 'clinical.perio.examination.amended'),
  'ADOPTED',
  'adopting an orphan successor is distinguishable from creating one in the audit trail'
);

select extensions.is(
  (select pg_catalog.count(*)::integer from public.periodontal_examinations as exam
    where exam.predecessor_examination_id = (select examination_id from perio_rpc_scratch where label = 'draft')),
  1,
  'adoption did not fork the supersession chain'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000002',true);

select extensions.throws_ok(
  $$select * from public.amend_periodontal_examination_v2(
      'ea800000-0000-0000-0000-00000000000c'::uuid,
      'A DRAFT predecessor cannot be superseded.',
      'ea900000-0000-0000-0000-000000000042'::uuid)$$,
  'P0001','invalid state',
  'a DRAFT examination may not be amended, because it has not replaced anything yet'
);

select extensions.throws_ok(
  pg_catalog.format(
    $$select * from public.amend_periodontal_examination_v2(%L::uuid, '   ',
      'ea900000-0000-0000-0000-000000000043'::uuid)$$,
    (select examination_id from perio_rpc_scratch where label = 'draft')),
  '22023','invalid input',
  'an amendment reason of whitespace is refused'
);

reset role;

-- ===========================================================================
-- 7. The workspace and comparison projections
-- ===========================================================================

-- FIRST, deliberately: a record variable's tuple structure is resolved when
-- PL/pgSQL plans the expression that reads it, so a projection that leaves its
-- derived record unassigned on the no-examination path fails - and fails only
-- until some other call in the same backend has planned it with the record
-- assigned. Reading a patient who has never been charted is the very first
-- thing the workspace does for a new patient, so it is asserted before any
-- other call to this function warms the plan.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.ok(
  (select workspace.payload -> 'examination' = 'null'::jsonb
     and workspace.payload -> 'derived' = 'null'::jsonb
     and workspace.payload -> 'sites' = '[]'::jsonb
     and workspace.payload -> 'timeline' = '[]'::jsonb
   from public.get_periodontal_workspace_v2(
     'ea500000-0000-0000-0000-000000000003'::uuid,
     'ea300000-0000-0000-0000-000000000001'::uuid, null) as workspace),
  'the workspace projection answers a patient with no periodontal examination at all instead of failing'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.ok(
  (select workspace.payload -> 'examination' ->> 'status' = 'FINAL'
     and pg_catalog.jsonb_array_length(workspace.payload -> 'sites') = 6
     and workspace.payload -> 'derived' ->> 'diagnosis' = 'GINGIVITIS'
   from public.get_periodontal_workspace_v2(
     'ea500000-0000-0000-0000-000000000001'::uuid,
     'ea300000-0000-0000-0000-000000000001'::uuid,
     (select examination_id from perio_rpc_scratch where label = 'draft')) as workspace),
  'the workspace projection returns the canonical examination, its sites, and the server-derived classification'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000005',true);

select extensions.throws_ok(
  $$select * from public.get_periodontal_workspace_v2(
      'ea500000-0000-0000-0000-000000000001'::uuid,
      'ea300000-0000-0000-0000-000000000001'::uuid, null)$$,
  '42501','not authorized',
  'a dentist from another organization may not read the periodontal workspace of a foreign patient'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

-- The adopted amendment carries no measurements at all, so every site of the
-- FINAL predecessor is present on one side only. A full outer join reports the
-- missing side as null and the delta as unknown, never as zero.
select extensions.ok(
  (select pg_catalog.jsonb_array_length(comparison.payload -> 'sites') = 6
     and not exists (
       select 1
       from pg_catalog.jsonb_array_elements(comparison.payload -> 'sites') as entry
       where entry.value -> 'delta_probing_depth_mm' <> 'null'::jsonb
     )
   from public.compare_periodontal_examinations_v2(
     'ea500000-0000-0000-0000-000000000001'::uuid,
     'ea300000-0000-0000-0000-000000000001'::uuid,
     (select examination_id from perio_rpc_scratch where label = 'draft'),
     'ea800000-0000-0000-0000-00000000000c'::uuid) as comparison),
  'comparison full outer joins the two site sets and reports an absent counterpart as unknown rather than zero'
);

-- Task 12. Attribution on the comparison header. Two examinations charted by
-- different clinicians, or at different branches, are not straightforwardly
-- comparable, and the screen can only say so if the projection carries who and
-- where. Every one of these is nullable and must stay null when it is genuinely
-- unknown rather than being coalesced to a placeholder.
select extensions.ok(
  (select comparison.payload -> 'left' ->> 'examined_provider_id'
            = 'ea600000-0000-0000-0000-000000000001'
     and comparison.payload -> 'left' ->> 'examined_provider_name' is not null
     and comparison.payload -> 'left' ->> 'branch_id'
            = 'ea300000-0000-0000-0000-000000000001'
     and comparison.payload -> 'left' ->> 'branch_name' is not null
     and comparison.payload -> 'right' ->> 'branch_id'
            = 'ea300000-0000-0000-0000-000000000001'
   from public.compare_periodontal_examinations_v2(
     'ea500000-0000-0000-0000-000000000001'::uuid,
     'ea300000-0000-0000-0000-000000000001'::uuid,
     (select examination_id from perio_rpc_scratch where label = 'draft'),
     'ea800000-0000-0000-0000-00000000000c'::uuid) as comparison),
  'the comparison header names the examining provider and the branch each examination belongs to'
);

-- An examination that was never finalized has no finalizing provider, and the
-- header reports that as unknown rather than naming the examiner instead.
select extensions.ok(
  (select comparison.payload -> 'right' -> 'finalized_provider_id' = 'null'::jsonb
     and comparison.payload -> 'right' -> 'finalized_provider_name' = 'null'::jsonb
   from public.compare_periodontal_examinations_v2(
     'ea500000-0000-0000-0000-000000000001'::uuid,
     'ea300000-0000-0000-0000-000000000001'::uuid,
     (select examination_id from perio_rpc_scratch where label = 'draft'),
     'ea800000-0000-0000-0000-00000000000c'::uuid) as comparison),
  'an examination with no finalizing provider reports that attribution as unknown rather than borrowing the examiner'
);

select extensions.throws_ok(
  pg_catalog.format(
    $$select * from public.compare_periodontal_examinations_v2(
        'ea500000-0000-0000-0000-000000000001'::uuid,
        'ea300000-0000-0000-0000-000000000001'::uuid,
        %L::uuid, 'ea800000-0000-0000-0000-0000000000ff'::uuid)$$,
    (select examination_id from perio_rpc_scratch where label = 'draft')),
  '42501','not authorized',
  'comparison refuses an examination that does not belong to the derived tenant and patient'
);

reset role;

-- ===========================================================================
-- 8. The superseded autosave boundary can no longer hide a write
--
-- public.save_periodontal_measurements updated only updated_at and never
-- touched the version, so a write through it was invisible to the versioned
-- boundary's guard: a clinician holding the draft at version N could autosave
-- straight over measurements someone else had just written, with no conflict
-- shown to anyone. It now increments the version like every other accepted
-- batch, so the versioned boundary sees the write and refuses.
-- ===========================================================================

insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, examination_kind, status,
  examined_at, examined_by, examined_provider_id
) values (
  'ea800000-0000-0000-0000-00000000000f','ea200000-0000-0000-0000-000000000001',
  'ea500000-0000-0000-0000-000000000001',
  (select encounter_id from perio_rpc_scratch where label = 'draft'),
  'MAINTENANCE','DRAFT', statement_timestamp(),
  'ea100000-0000-0000-0000-000000000001','ea600000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.is(
  (select legacy.version from public.save_periodontal_measurements(
     'ea300000-0000-0000-0000-000000000001'::uuid,
     'ea800000-0000-0000-0000-00000000000f'::uuid,
     '[{"tooth_fdi":"17","site":"B","probing_depth_mm":3,"gingival_margin_mm":0}]'::jsonb,
     '[]'::jsonb, '[]'::jsonb, '[]'::jsonb) as legacy),
  2,
  'the superseded autosave boundary reports the version it actually left behind'
);

reset role;

select extensions.is(
  (select exam.version from public.periodontal_examinations as exam
    where exam.id = 'ea800000-0000-0000-0000-00000000000f'),
  2,
  'a write through the superseded autosave boundary advances the examination version'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.throws_ok(
  $$select * from public.save_periodontal_measurements_v2(
      'ea800000-0000-0000-0000-00000000000f'::uuid, 1,
      '{"sites":[{"tooth_fdi":"17","site":"B","probing_depth_mm":9,"gingival_margin_mm":0}]}'::jsonb,
      'ea900000-0000-0000-0000-000000000050'::uuid)$$,
  'P0001','stale version',
  'the versioned boundary now sees a write made through the superseded one and refuses to overwrite it'
);

reset role;

select extensions.is(
  (select site.probing_depth_mm from public.periodontal_site_measurements as site
    where site.examination_id = 'ea800000-0000-0000-0000-00000000000f'
      and site.tooth_fdi = '17' and site.site = 'B'),
  3,
  'the lost update the superseded boundary used to allow no longer happens'
);

-- A no-op batch through the superseded boundary writes nothing, so it must
-- leave the version alone. Incrementing on an empty batch would hand a
-- versioned client a `stale version` conflict that corresponds to no write at
-- all, and a client cannot tell a phantom conflict from a real one.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.is(
  (select legacy.version from public.save_periodontal_measurements(
     'ea300000-0000-0000-0000-000000000001'::uuid,
     'ea800000-0000-0000-0000-00000000000f'::uuid,
     '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb) as legacy),
  2,
  'a batch of empty arrays through the superseded boundary reports the unchanged version'
);

reset role;

select extensions.is(
  (select exam.version from public.periodontal_examinations as exam
    where exam.id = 'ea800000-0000-0000-0000-00000000000f'),
  2,
  'a no-op call through the superseded boundary does not advance the version'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.is(
  (select save.version from public.save_periodontal_measurements_v2(
     'ea800000-0000-0000-0000-00000000000f'::uuid, 2,
     '{"sites":[{"tooth_fdi":"17","site":"B","probing_depth_mm":4,"gingival_margin_mm":0}]}'::jsonb,
     'ea900000-0000-0000-0000-000000000053'::uuid) as save),
  3,
  'the versioned boundary is not handed a phantom conflict by a no-op call through the superseded one'
);

reset role;

-- ===========================================================================
-- 9b. Adoption records the attribution it replaced
--
-- examined_by is ON DELETE SET NULL, so deleting an authoring user empties one
-- column of an otherwise complete triple. Adoption completes the triple with
-- the adopter, and names the provider it superseded so the replacement is not
-- silent.
-- ===========================================================================

insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, examination_kind, status,
  examined_at, examined_by, examined_provider_id
) values (
  'ea800000-0000-0000-0000-000000000012','ea200000-0000-0000-0000-000000000001',
  'ea500000-0000-0000-0000-000000000001',
  (select encounter_id from perio_rpc_scratch where label = 'draft'),
  'MAINTENANCE','DRAFT', statement_timestamp(),
  'ea100000-0000-0000-0000-000000000001','ea600000-0000-0000-0000-000000000001'
);

update public.periodontal_examinations
set status = 'FINAL', finalized_at = statement_timestamp(),
    finalized_by = 'ea100000-0000-0000-0000-000000000001',
    finalized_provider_id = 'ea600000-0000-0000-0000-000000000001'
where id = 'ea800000-0000-0000-0000-000000000012';

-- The orphan an ON DELETE SET NULL leaves behind: a time and a provider, but no
-- author.
insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, predecessor_examination_id,
  examination_kind, status, version, examined_at, examined_by, examined_provider_id
) values (
  'ea800000-0000-0000-0000-000000000013','ea200000-0000-0000-0000-000000000001',
  'ea500000-0000-0000-0000-000000000001',
  (select encounter_id from perio_rpc_scratch where label = 'draft'),
  'ea800000-0000-0000-0000-000000000012',
  'AMENDMENT','DRAFT', 2, statement_timestamp(),
  null, 'ea600000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000002',true);

select extensions.ok(
  (select amendment.adopted
   from public.amend_periodontal_examination_v2(
     'ea800000-0000-0000-0000-000000000012'::uuid,
     'The maintenance chart was signed before the radiographs were read.',
     'ea900000-0000-0000-0000-000000000054'::uuid) as amendment),
  'an orphan successor whose author was deleted is still adopted'
);

reset role;

select extensions.is(
  (select event.metadata ->> 'attribution_previous_provider'
   from public.audit_events as event
   where event.entity_id = 'ea800000-0000-0000-0000-000000000013'
     and event.action = 'clinical.perio.examination.amended'),
  'ea600000-0000-0000-0000-000000000001',
  'replacing an incomplete attribution names the provider it superseded'
);

select extensions.ok(
  (select exam.examined_by = 'ea100000-0000-0000-0000-000000000002'::uuid
     and exam.examined_provider_id = 'ea600000-0000-0000-0000-000000000002'::uuid
   from public.periodontal_examinations as exam
   where exam.id = 'ea800000-0000-0000-0000-000000000013'),
  'the completed attribution names the adopting clinician, so the amendment stays finalizable'
);

-- Adoption that preserves a complete triple replaces no attribution, so there
-- is nothing to report and the key is absent rather than null.
select extensions.ok(
  (select not (event.metadata ? 'attribution_previous_provider')
   from public.audit_events as event
   where event.entity_id = 'ea800000-0000-0000-0000-00000000000c'
     and event.action = 'clinical.perio.examination.amended'),
  'preserving a complete attribution reports no superseded provider at all'
);


-- ===========================================================================
-- 9. Amendment lineage: the creating path, and what it audits
-- ===========================================================================

insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, examination_kind, status,
  examined_at, examined_by, examined_provider_id
) values (
  'ea800000-0000-0000-0000-00000000000e','ea200000-0000-0000-0000-000000000001',
  'ea500000-0000-0000-0000-000000000001',
  (select encounter_id from perio_rpc_scratch where label = 'draft'),
  'MAINTENANCE','DRAFT', statement_timestamp(),
  'ea100000-0000-0000-0000-000000000001','ea600000-0000-0000-0000-000000000001'
);

insert into public.periodontal_site_measurements (
  organization_id, examination_id, tooth_fdi, site, probing_depth_mm,
  gingival_margin_mm, bleeding_on_probing, suppuration
)
select 'ea200000-0000-0000-0000-000000000001'::uuid,
       'ea800000-0000-0000-0000-00000000000e'::uuid, '27', site_code.site, 3, 0, false, false
from (values ('MB'),('B'),('DB'),('ML'),('L'),('DL')) as site_code(site);

update public.periodontal_examinations
set status = 'FINAL', finalized_at = statement_timestamp(),
    finalized_by = 'ea100000-0000-0000-0000-000000000001',
    finalized_provider_id = 'ea600000-0000-0000-0000-000000000001'
where id = 'ea800000-0000-0000-0000-00000000000e';

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000002',true);

select extensions.ok(
  (select not amendment.adopted
   from public.amend_periodontal_examination_v2(
     'ea800000-0000-0000-0000-00000000000e'::uuid,
     'The maintenance chart was signed against the wrong quadrant.',
     'ea900000-0000-0000-0000-000000000051'::uuid) as amendment),
  'a predecessor with no successor at all gets a freshly created amendment rather than an adoption'
);

reset role;

select extensions.is(
  (select event.metadata ->> 'action'
   from public.audit_events as event
   join public.periodontal_examinations as exam on exam.id = event.entity_id
   where exam.predecessor_examination_id = 'ea800000-0000-0000-0000-00000000000e'
     and event.action = 'clinical.perio.examination.amended'),
  'CREATED',
  'creating a successor is distinguishable from adopting one in the audit trail'
);

select extensions.is(
  (select pg_catalog.count(*)::integer
   from public.periodontal_site_measurements as site
   join public.periodontal_examinations as exam
     on exam.id = site.examination_id
   where exam.predecessor_examination_id = 'ea800000-0000-0000-0000-00000000000e'),
  6,
  'the created amendment starts as a clone of the record it corrects'
);

select extensions.ok(
  (select exam.examined_provider_id = 'ea600000-0000-0000-0000-000000000002'::uuid
     and exam.amendment_reason is not null
   from public.periodontal_examinations as exam
   where exam.predecessor_examination_id = 'ea800000-0000-0000-0000-00000000000e'),
  'a freshly created amendment is authored by the amending clinician, because nobody else charted it'
);

-- An orphan successor whose attribution triple is INCOMPLETE. The revoked
-- three-argument amend boundary could leave the provider null, and examined_by
-- is ON DELETE SET NULL, so deleting the authoring user empties one column of
-- an otherwise complete triple. Preserving a partial triple would leave an
-- amendment that periodontal_examinations_finalized_state_check can never
-- finalize, turning the orphan into a second dead end.

insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, examination_kind, status,
  examined_at, examined_by, examined_provider_id
) values (
  'ea800000-0000-0000-0000-000000000010','ea200000-0000-0000-0000-000000000001',
  'ea500000-0000-0000-0000-000000000001',
  (select encounter_id from perio_rpc_scratch where label = 'draft'),
  'MAINTENANCE','DRAFT', statement_timestamp(),
  'ea100000-0000-0000-0000-000000000001','ea600000-0000-0000-0000-000000000001'
);

update public.periodontal_examinations
set status = 'FINAL', finalized_at = statement_timestamp(),
    finalized_by = 'ea100000-0000-0000-0000-000000000001',
    finalized_provider_id = 'ea600000-0000-0000-0000-000000000001'
where id = 'ea800000-0000-0000-0000-000000000010';

insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, predecessor_examination_id,
  examination_kind, status, version, examined_at, examined_by, examined_provider_id
) values (
  'ea800000-0000-0000-0000-000000000011','ea200000-0000-0000-0000-000000000001',
  'ea500000-0000-0000-0000-000000000001',
  (select encounter_id from perio_rpc_scratch where label = 'draft'),
  'ea800000-0000-0000-0000-000000000010',
  'AMENDMENT','DRAFT', 2, statement_timestamp(),
  'ea100000-0000-0000-0000-000000000001', null
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000002',true);

select extensions.ok(
  (select amendment.adopted
   from public.amend_periodontal_examination_v2(
     'ea800000-0000-0000-0000-000000000010'::uuid,
     'The maintenance chart recorded the wrong probing depths.',
     'ea900000-0000-0000-0000-000000000052'::uuid) as amendment),
  'an orphan successor with an incomplete attribution triple is still adopted'
);

reset role;

select extensions.ok(
  (select exam.examined_at is not null
     and exam.examined_by = 'ea100000-0000-0000-0000-000000000002'::uuid
     and exam.examined_provider_id = 'ea600000-0000-0000-0000-000000000002'::uuid
   from public.periodontal_examinations as exam
   where exam.id = 'ea800000-0000-0000-0000-000000000011'),
  'an incomplete attribution triple is completed with the adopting clinician rather than preserved half-empty, so the amendment can still be finalized'
);

-- ===========================================================================
-- 10. The derived classification: the PERIODONTITIS branch
--
-- Finalization trusts private.periodontal_derived_classification, so the branch
-- it trusts most is exercised directly against canonical rows: stage bands, the
-- CAL-versus-bone-loss maximum, both complexity escalations, the stage IV
-- override, all three grade buckets and the B baseline, the molar-incisor
-- pattern, and the known-attachment extent denominator.
-- ===========================================================================

insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, examination_kind, status,
  examined_at, examined_by, examined_provider_id
)
select spec.id, 'ea200000-0000-0000-0000-000000000001'::uuid,
       'ea500000-0000-0000-0000-000000000001'::uuid,
       (select encounter_id from perio_rpc_scratch where label = 'draft'),
       'RE-EVALUATION', 'DRAFT', statement_timestamp(),
       'ea100000-0000-0000-0000-000000000001'::uuid,
       'ea600000-0000-0000-0000-000000000001'::uuid
from (values
  ('ea8d0000-0000-0000-0000-000000000001'::uuid),
  ('ea8d0000-0000-0000-0000-000000000002'::uuid),
  ('ea8d0000-0000-0000-0000-000000000003'::uuid),
  ('ea8d0000-0000-0000-0000-000000000004'::uuid),
  ('ea8d0000-0000-0000-0000-000000000005'::uuid),
  ('ea8d0000-0000-0000-0000-000000000006'::uuid),
  ('ea8d0000-0000-0000-0000-000000000007'::uuid),
  ('ea8d0000-0000-0000-0000-000000000008'::uuid),
  ('ea8d0000-0000-0000-0000-000000000009'::uuid),
  ('ea8d0000-0000-0000-0000-00000000000a'::uuid)
) as spec(id);

-- Six sites per listed tooth. cal_mm is generated as probing depth plus margin.
insert into public.periodontal_site_measurements (
  organization_id, examination_id, tooth_fdi, site, probing_depth_mm,
  gingival_margin_mm, bleeding_on_probing, suppuration
)
select 'ea200000-0000-0000-0000-000000000001'::uuid, spec.exam, spec.tooth,
       site_code.site, spec.pd, spec.margin, false, false
from (values
  -- Stage II, grade B, generalized: two non-adjacent molars at CAL 3.
  ('ea8d0000-0000-0000-0000-000000000001'::uuid, '16', 3, 0),
  ('ea8d0000-0000-0000-0000-000000000001'::uuid, '26', 3, 0),
  -- CAL band 1, but a probing depth of 6 escalates complexity to stage III.
  ('ea8d0000-0000-0000-0000-000000000002'::uuid, '16', 6, -4),
  ('ea8d0000-0000-0000-0000-000000000002'::uuid, '26', 6, -4),
  -- CAL band 2, escalated to stage III by a furcation grade 2 below.
  ('ea8d0000-0000-0000-0000-000000000003'::uuid, '16', 3, 0),
  ('ea8d0000-0000-0000-0000-000000000003'::uuid, '26', 3, 0),
  -- Stage IV from teeth lost to periodontitis, overriding the band.
  ('ea8d0000-0000-0000-0000-000000000004'::uuid, '16', 3, 0),
  ('ea8d0000-0000-0000-0000-000000000004'::uuid, '26', 3, 0),
  -- Bone loss band 3 beats CAL band 2, and the ratio grades C.
  ('ea8d0000-0000-0000-0000-000000000005'::uuid, '16', 3, 0),
  ('ea8d0000-0000-0000-0000-000000000005'::uuid, '26', 3, 0),
  -- An affected molar and an affected incisor, nothing else: molar-incisor.
  ('ea8d0000-0000-0000-0000-000000000006'::uuid, '16', 3, 0),
  ('ea8d0000-0000-0000-0000-000000000006'::uuid, '11', 3, 0),
  -- Two affected of eight teeth whose attachment level is known: localized.
  ('ea8d0000-0000-0000-0000-000000000007'::uuid, '16', 3, 0),
  ('ea8d0000-0000-0000-0000-000000000007'::uuid, '26', 3, 0),
  ('ea8d0000-0000-0000-0000-000000000007'::uuid, '13', 2, -2),
  ('ea8d0000-0000-0000-0000-000000000007'::uuid, '14', 2, -2),
  ('ea8d0000-0000-0000-0000-000000000007'::uuid, '15', 2, -2),
  ('ea8d0000-0000-0000-0000-000000000007'::uuid, '23', 2, -2),
  ('ea8d0000-0000-0000-0000-000000000007'::uuid, '24', 2, -2),
  ('ea8d0000-0000-0000-0000-000000000007'::uuid, '25', 2, -2),
  -- A permanent molar and a deciduous molar. A deciduous tooth has no
  -- permanent-arch position, so the pair is NOT adjacent and must count.
  ('ea8d0000-0000-0000-0000-000000000008'::uuid, '16', 3, 0),
  ('ea8d0000-0000-0000-0000-000000000008'::uuid, '55', 3, 0),
  -- Grade C from a heavy current smoker.
  ('ea8d0000-0000-0000-0000-000000000009'::uuid, '16', 3, 0),
  ('ea8d0000-0000-0000-0000-000000000009'::uuid, '26', 3, 0),
  -- Grade C from diabetes with a raised HbA1c.
  ('ea8d0000-0000-0000-0000-00000000000a'::uuid, '16', 3, 0),
  ('ea8d0000-0000-0000-0000-00000000000a'::uuid, '26', 3, 0)
) as spec(exam, tooth, pd, margin)
cross join (values ('MB'),('B'),('DB'),('ML'),('L'),('DL')) as site_code(site);

insert into public.periodontal_furcation_measurements (
  organization_id, examination_id, tooth_fdi, entrance, grade
) values (
  'ea200000-0000-0000-0000-000000000001','ea8d0000-0000-0000-0000-000000000003','16','buccal',2
);

update public.periodontal_examinations as exam
set age_years_snapshot = spec.age,
    smoking_status = spec.smoking,
    cigarettes_per_day = spec.cigarettes,
    diabetes_status = spec.diabetes,
    hba1c_percent = spec.hba1c,
    teeth_lost_to_periodontitis = spec.teeth_lost,
    radiographic_bone_loss_percent = spec.bone_loss
from (values
  ('ea8d0000-0000-0000-0000-000000000001'::uuid, 40::smallint, 'NEVER'::text, null::smallint, 'NONE'::text, null::numeric, null::smallint, null::smallint),
  ('ea8d0000-0000-0000-0000-000000000002'::uuid, 40::smallint, 'NEVER'::text, null::smallint, 'NONE'::text, null::numeric, null::smallint, null::smallint),
  ('ea8d0000-0000-0000-0000-000000000003'::uuid, 40::smallint, 'NEVER'::text, null::smallint, 'NONE'::text, null::numeric, null::smallint, null::smallint),
  ('ea8d0000-0000-0000-0000-000000000004'::uuid, 40::smallint, 'NEVER'::text, null::smallint, 'NONE'::text, null::numeric, 5::smallint, null::smallint),
  ('ea8d0000-0000-0000-0000-000000000005'::uuid, 30::smallint, null::text, null::smallint, null::text, null::numeric, null::smallint, 40::smallint),
  ('ea8d0000-0000-0000-0000-000000000006'::uuid, 40::smallint, 'NEVER'::text, null::smallint, 'NONE'::text, null::numeric, null::smallint, null::smallint),
  ('ea8d0000-0000-0000-0000-000000000007'::uuid, 40::smallint, 'NEVER'::text, null::smallint, 'NONE'::text, null::numeric, null::smallint, null::smallint),
  ('ea8d0000-0000-0000-0000-000000000009'::uuid, 40::smallint, 'CURRENT'::text, 20::smallint, 'NONE'::text, null::numeric, null::smallint, null::smallint),
  ('ea8d0000-0000-0000-0000-00000000000a'::uuid, 40::smallint, 'NEVER'::text, null::smallint, 'TYPE_2'::text, 8.1::numeric, null::smallint, null::smallint)
) as spec(exam, age, smoking, cigarettes, diabetes, hba1c, teeth_lost, bone_loss)
where exam.id = spec.exam;

select extensions.is(
  (select derivation.diagnosis || '/' || coalesce(derivation.stage, '~')
     || '/' || coalesce(derivation.grade, '~') || '/' || coalesce(derivation.extent, '~')
   from private.periodontal_derived_classification(
     'ea200000-0000-0000-0000-000000000001'::uuid, spec.exam) as derivation),
  spec.expected,
  spec.description
)
from (values
  ('ea8d0000-0000-0000-0000-000000000001'::uuid, 'PERIODONTITIS/II/B/GENERALIZED',
   'interdental attachment loss at two non-adjacent teeth is periodontitis, staged from the attachment band and graded from the known risk modifiers'),
  ('ea8d0000-0000-0000-0000-000000000002'::uuid, 'PERIODONTITIS/III/B/GENERALIZED',
   'a probing depth of 6 mm escalates complexity to stage III without downgrading anything'),
  ('ea8d0000-0000-0000-0000-000000000003'::uuid, 'PERIODONTITIS/III/B/GENERALIZED',
   'a furcation grade 2 escalates complexity to stage III'),
  ('ea8d0000-0000-0000-0000-000000000004'::uuid, 'PERIODONTITIS/IV/B/GENERALIZED',
   'five teeth lost to periodontitis overrides the derived stage with IV'),
  ('ea8d0000-0000-0000-0000-000000000005'::uuid, 'PERIODONTITIS/III/C/GENERALIZED',
   'the higher of the attachment and bone-loss bands wins, and a bone-loss-over-age ratio above 1 grades C'),
  ('ea8d0000-0000-0000-0000-000000000006'::uuid, 'PERIODONTITIS/II/B/MOLAR_INCISOR',
   'an affected molar and an affected incisor with nothing else affected is the molar-incisor pattern'),
  ('ea8d0000-0000-0000-0000-000000000007'::uuid, 'PERIODONTITIS/II/B/LOCALIZED',
   'the extent denominator counts teeth whose attachment level is actually known, so two affected of eight is localized'),
  ('ea8d0000-0000-0000-0000-000000000008'::uuid, 'PERIODONTITIS/II/~/GENERALIZED',
   'a permanent tooth and a deciduous tooth are not arch-adjacent, so the pair counts and the grade stays unknown when no modifier is recorded'),
  ('ea8d0000-0000-0000-0000-000000000009'::uuid, 'PERIODONTITIS/II/C/GENERALIZED',
   'a current smoker at ten or more cigarettes a day grades C'),
  ('ea8d0000-0000-0000-0000-00000000000a'::uuid, 'PERIODONTITIS/II/C/GENERALIZED',
   'diabetes with an HbA1c at or above 7 grades C')
) as spec(exam, expected, description);

select extensions.ok(
  (select derivation.complete and derivation.present_tooth_count = 2
     and derivation.teeth_with_known_interdental_cal = 2
   from private.periodontal_derived_classification(
     'ea200000-0000-0000-0000-000000000001'::uuid,
     'ea8d0000-0000-0000-0000-000000000001'::uuid) as derivation),
  'the completeness summary counts only present teeth and only known attachment levels'
);

-- Four decision points the ten cases above do not reach. Each is unreached
-- rather than reached-and-correct, and Task 12 renders these values straight to
-- a clinician.

insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, examination_kind, status,
  examined_at, examined_by, examined_provider_id
)
select spec.id, 'ea200000-0000-0000-0000-000000000001'::uuid,
       'ea500000-0000-0000-0000-000000000001'::uuid,
       (select encounter_id from perio_rpc_scratch where label = 'draft'),
       'RE-EVALUATION', 'DRAFT', statement_timestamp(),
       'ea100000-0000-0000-0000-000000000001'::uuid,
       'ea600000-0000-0000-0000-000000000001'::uuid
from (values
  ('ea8d0000-0000-0000-0000-00000000000b'::uuid),
  ('ea8d0000-0000-0000-0000-00000000000c'::uuid),
  ('ea8d0000-0000-0000-0000-00000000000d'::uuid),
  ('ea8d0000-0000-0000-0000-00000000000e'::uuid)
) as spec(id);

-- Uniform six-site charts. A NULL margin makes the attachment level at that
-- site unknown, which is not the same as an attachment level of zero.
insert into public.periodontal_site_measurements (
  organization_id, examination_id, tooth_fdi, site, probing_depth_mm,
  gingival_margin_mm, bleeding_on_probing, suppuration
)
select 'ea200000-0000-0000-0000-000000000001'::uuid, spec.exam, spec.tooth,
       site_code.site, spec.pd, spec.margin, false, false
from (values
  -- Grade A: a bone-loss-over-age ratio below 0.25 with both modifiers known
  -- and unremarkable. Bone loss of 5 % is band 1, so the attachment band still
  -- decides the stage.
  ('ea8d0000-0000-0000-0000-00000000000b'::uuid, '16', 3, 0::integer),
  ('ea8d0000-0000-0000-0000-00000000000b'::uuid, '26', 3, 0),
  -- Attachment band 3 reached through attachment alone: CAL 5 with a probing
  -- depth below the escalation threshold and no bone loss recorded.
  ('ea8d0000-0000-0000-0000-00000000000c'::uuid, '16', 5, 0),
  ('ea8d0000-0000-0000-0000-00000000000c'::uuid, '26', 5, 0),
  -- The extent denominator, made to discriminate: two affected teeth, two more
  -- whose attachment level is KNOWN and healthy, and four present teeth whose
  -- attachment level is unknown. Counting present teeth would answer
  -- LOCALIZED (2/8); counting known attachment answers GENERALIZED (2/4).
  ('ea8d0000-0000-0000-0000-00000000000e'::uuid, '16', 3, 0),
  ('ea8d0000-0000-0000-0000-00000000000e'::uuid, '26', 3, 0),
  ('ea8d0000-0000-0000-0000-00000000000e'::uuid, '13', 2, -2),
  ('ea8d0000-0000-0000-0000-00000000000e'::uuid, '23', 2, -2),
  ('ea8d0000-0000-0000-0000-00000000000e'::uuid, '14', 3, null),
  ('ea8d0000-0000-0000-0000-00000000000e'::uuid, '15', 3, null),
  ('ea8d0000-0000-0000-0000-00000000000e'::uuid, '24', 3, null),
  ('ea8d0000-0000-0000-0000-00000000000e'::uuid, '25', 3, null)
) as spec(exam, tooth, pd, margin)
cross join (values ('MB'),('B'),('DB'),('ML'),('L'),('DL')) as site_code(site);

-- The buccal/oral fallback needs per-site control: the interdental sites carry
-- no margin, so no tooth is "affected" by the interdental criterion at all, and
-- the branch can only be entered through the second route.
insert into public.periodontal_site_measurements (
  organization_id, examination_id, tooth_fdi, site, probing_depth_mm,
  gingival_margin_mm, bleeding_on_probing, suppuration
)
select 'ea200000-0000-0000-0000-000000000001'::uuid,
       'ea8d0000-0000-0000-0000-00000000000d'::uuid, spec.tooth, spec.site,
       spec.pd, spec.margin, false, false
from (values
  ('16'::text, 'MB'::text, 4, null::integer), ('16', 'DB', 4, null),
  ('16', 'ML', 4, null), ('16', 'DL', 4, null),
  ('16', 'B', 4, -1), ('16', 'L', 4, -1),
  ('26', 'MB', 4, null), ('26', 'DB', 4, null),
  ('26', 'ML', 4, null), ('26', 'DL', 4, null),
  ('26', 'B', 4, -1), ('26', 'L', 4, -1)
) as spec(tooth, site, pd, margin);

update public.periodontal_examinations as exam
set age_years_snapshot = spec.age,
    smoking_status = spec.smoking,
    diabetes_status = spec.diabetes,
    radiographic_bone_loss_percent = spec.bone_loss
from (values
  ('ea8d0000-0000-0000-0000-00000000000b'::uuid, 40::smallint, 'NEVER'::text, 'NONE'::text, 5::smallint),
  ('ea8d0000-0000-0000-0000-00000000000c'::uuid, 40::smallint, 'NEVER'::text, 'NONE'::text, null::smallint),
  ('ea8d0000-0000-0000-0000-00000000000e'::uuid, 40::smallint, 'NEVER'::text, 'NONE'::text, null::smallint)
) as spec(exam, age, smoking, diabetes, bone_loss)
where exam.id = spec.exam;

select extensions.is(
  (select derivation.diagnosis || '/' || coalesce(derivation.stage, '~')
     || '/' || coalesce(derivation.grade, '~') || '/' || coalesce(derivation.extent, '~')
   from private.periodontal_derived_classification(
     'ea200000-0000-0000-0000-000000000001'::uuid, spec.exam) as derivation),
  spec.expected,
  spec.description
)
from (values
  ('ea8d0000-0000-0000-0000-00000000000b'::uuid, 'PERIODONTITIS/II/A/GENERALIZED',
   'a bone-loss-over-age ratio below 0.25 with both modifiers unremarkable grades A'),
  ('ea8d0000-0000-0000-0000-00000000000c'::uuid, 'PERIODONTITIS/III/B/GENERALIZED',
   'an interdental attachment level of 5 mm reaches band III through attachment alone, with no bone loss and no complexity escalation'),
  ('ea8d0000-0000-0000-0000-00000000000d'::uuid, 'PERIODONTITIS/~/~/~',
   'the buccal and oral fallback reaches periodontitis on its own, and leaves the stage, grade and extent unknown rather than inventing them'),
  ('ea8d0000-0000-0000-0000-00000000000e'::uuid, 'PERIODONTITIS/II/B/GENERALIZED',
   'the extent denominator counts teeth whose attachment level is known, so two affected of four known is generalized even though it is two of eight present')
) as spec(exam, expected, description);

-- The discriminating half of the previous assertion: the two counts must
-- actually diverge, or an implementation using the present-tooth count would
-- pass it identically.
select extensions.ok(
  (select derivation.present_tooth_count = 8
     and derivation.teeth_with_known_interdental_cal = 4
     and not derivation.complete
   from private.periodontal_derived_classification(
     'ea200000-0000-0000-0000-000000000001'::uuid,
     'ea8d0000-0000-0000-0000-00000000000e'::uuid) as derivation),
  'a present tooth whose attachment level is unknown is counted as present but not as known, so the two counts diverge'
);

-- The same distinction on the entry criterion: no tooth reaches the interdental
-- rule here, so the branch was entered through the buccal and oral fallback.
select extensions.ok(
  (select derivation.present_tooth_count = 2
     and derivation.teeth_with_known_interdental_cal = 0
   from private.periodontal_derived_classification(
     'ea200000-0000-0000-0000-000000000001'::uuid,
     'ea8d0000-0000-0000-0000-00000000000d'::uuid) as derivation),
  'the buccal and oral fallback is reached with no tooth carrying a known interdental attachment level at all'
);

-- ===========================================================================
-- 8. Unknown is writable in BOTH directions (task 12)
--
-- Tasks 9 to 11 made NULL the single representation of unknown on the way IN:
-- nullable columns with no defaults, a null-propagating cal_mm, aggregates that
-- count only the sites that exist, and a boundary that refuses to coalesce an
-- omitted reading to zero or false. None of that let a clinician put a value
-- BACK to unknown, so unknown was only ever an initial state: a probing depth
-- mistyped onto a site nobody probed, or a bleeding answer given for the wrong
-- site, was permanent even on a DRAFT.
--
-- The distinction the boundary already draws is key PRESENCE, not value. An
-- absent key says nothing about the column and preserves it; an explicit null
-- says "this is not known" and clears it. This section proves the second half
-- end to end - through the RPC and against the stored rows - rather than only
-- at the browser schema.
--
-- Only genuinely nullable columns participate. probing_depth_mm, tooth_present,
-- implant_context and furcation grade are NOT NULL, so withdrawing one of those
-- is a deletion, and no boundary deletes.
-- ===========================================================================

insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, examination_kind, status,
  examined_at, examined_by, examined_provider_id
) values (
  'ea800000-0000-0000-0000-000000000014','ea200000-0000-0000-0000-000000000001',
  'ea500000-0000-0000-0000-000000000001',
  (select encounter_id from perio_rpc_scratch where label = 'draft'),
  'MAINTENANCE','DRAFT', statement_timestamp(),
  'ea100000-0000-0000-0000-000000000001','ea600000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

-- Everything that will be withdrawn is recorded first, across all three child
-- shapes that carry nullable columns plus the examination's own risk inputs.
select extensions.is(
  (select save.version from public.save_periodontal_measurements_v2(
     'ea800000-0000-0000-0000-000000000014'::uuid, 1,
     $withdraw_a${"sites":[{"tooth_fdi":"17","site":"MB","probing_depth_mm":4,"gingival_margin_mm":2,"bleeding_on_probing":true,"suppuration":true}],
        "plaque":[{"tooth_fdi":"17","surface":"BUCCAL","plaque_present":true,"plaque_index":2,"gingival_index":1}],
        "tooth":[{"tooth_fdi":"17","keratinized_gingiva_mm":3,"gingival_phenotype":"THIN","mobility_miller":"M1","cej_visible":true,"root_concavity":true,"miller_recession_class":"II"}],
        "risk":{"age_years_snapshot":50,"smoking_status":"CURRENT","cigarettes_per_day":12,"radiographic_bone_loss_percent":20}}$withdraw_a$::jsonb,
     'ea900000-0000-0000-0000-000000000060'::uuid) as save),
  2,
  'the readings that are about to be withdrawn are recorded first'
);

reset role;

select extensions.ok(
  (select site.gingival_margin_mm = 2 and site.cal_mm = 6
     and site.bleeding_on_probing and site.suppuration
   from public.periodontal_site_measurements as site
   where site.examination_id = 'ea800000-0000-0000-0000-000000000014'::uuid
     and site.tooth_fdi = '17' and site.site = 'MB'),
  'the site reading, including its derived attachment level, is on the record before the withdrawal'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

-- An EXPLICIT null on every nullable column. The probing depth is re-sent
-- unchanged because it is NOT NULL and is the row's identity, not a withdrawal.
--
-- smoking_status and cigarettes_per_day are cleared in the SAME statement on
-- purpose: perio_exam_cigarettes_current_smoker_check requires a cigarette
-- count to belong to a current smoker, so clearing the status alone would be
-- refused. One UPDATE sets both, and the constraint is satisfied.
select extensions.is(
  (select save.saved_sites + save.saved_plaque + save.saved_tooth
   from public.save_periodontal_measurements_v2(
     'ea800000-0000-0000-0000-000000000014'::uuid, 2,
     $withdraw_b${"sites":[{"tooth_fdi":"17","site":"MB","probing_depth_mm":4,"gingival_margin_mm":null,"bleeding_on_probing":null,"suppuration":null}],
        "plaque":[{"tooth_fdi":"17","surface":"BUCCAL","plaque_present":null,"plaque_index":null,"gingival_index":null}],
        "tooth":[{"tooth_fdi":"17","keratinized_gingiva_mm":null,"gingival_phenotype":null,"mobility_miller":null,"cej_visible":null,"root_concavity":null,"miller_recession_class":null}],
        "risk":{"age_years_snapshot":null,"smoking_status":null,"cigarettes_per_day":null,"radiographic_bone_loss_percent":null}}$withdraw_b$::jsonb,
     'ea900000-0000-0000-0000-000000000061'::uuid) as save),
  3,
  'an explicit null is a write: the site, surface and tooth rows are each updated exactly once'
);

reset role;

select extensions.ok(
  (select site.gingival_margin_mm is null and site.cal_mm is null
     and site.bleeding_on_probing is null and site.suppuration is null
     and site.probing_depth_mm = 4
   from public.periodontal_site_measurements as site
   where site.examination_id = 'ea800000-0000-0000-0000-000000000014'::uuid
     and site.tooth_fdi = '17' and site.site = 'MB'),
  'an explicit null clears a recorded gingival margin, bleeding and suppuration, and the derived attachment level goes unknown with them'
);

select extensions.ok(
  (select surface.plaque_present is null and surface.plaque_index is null
     and surface.gingival_index is null
   from public.periodontal_plaque_measurements as surface
   where surface.examination_id = 'ea800000-0000-0000-0000-000000000014'::uuid
     and surface.tooth_fdi = '17' and surface.surface = 'BUCCAL'),
  'an explicit null clears a recorded plaque assessment and its surface indices'
);

select extensions.ok(
  (select tooth.keratinized_gingiva_mm is null and tooth.gingival_phenotype is null
     and tooth.mobility_miller is null and tooth.cej_visible is null
     and tooth.root_concavity is null and tooth.miller_recession_class is null
     and tooth.tooth_present
   from public.periodontal_tooth_measurements as tooth
   where tooth.examination_id = 'ea800000-0000-0000-0000-000000000014'::uuid
     and tooth.tooth_fdi = '17'),
  'an explicit null clears every recorded tooth finding while the NOT NULL presence flag is left alone'
);

select extensions.ok(
  (select exam.age_years_snapshot is null and exam.smoking_status is null
     and exam.cigarettes_per_day is null and exam.radiographic_bone_loss_percent is null
   from public.periodontal_examinations as exam
   where exam.id = 'ea800000-0000-0000-0000-000000000014'::uuid),
  'an explicit null clears a recorded risk input, and a current-smoker cigarette count clears with the status it belongs to'
);

-- The no-op guard still holds for nulls. Re-sending the same explicit nulls
-- must write nothing at all, or every reopened chart would rewrite its own
-- unknowns and task 9's reset triggers would withdraw a standing confirmation
-- for no reason.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.is(
  (select save.saved_sites + save.saved_plaque + save.saved_tooth
   from public.save_periodontal_measurements_v2(
     'ea800000-0000-0000-0000-000000000014'::uuid, 3,
     $withdraw_c${"sites":[{"tooth_fdi":"17","site":"MB","probing_depth_mm":4,"gingival_margin_mm":null,"bleeding_on_probing":null,"suppuration":null}],
        "plaque":[{"tooth_fdi":"17","surface":"BUCCAL","plaque_present":null,"plaque_index":null,"gingival_index":null}],
        "tooth":[{"tooth_fdi":"17","keratinized_gingiva_mm":null,"gingival_phenotype":null,"mobility_miller":null,"cej_visible":null,"root_concavity":null,"miller_recession_class":null}]}$withdraw_c$::jsonb,
     'ea900000-0000-0000-0000-000000000062'::uuid) as save),
  0,
  'withdrawing what is already unknown writes nothing, so the no-op guard survives explicit nulls'
);

reset role;

-- Task 12 review round 2. The minimal tooth row a batch writes for a tooth that
-- has none must STATE the implant context, not leave it to the INSERT default.
--
-- private.enforce_periodontal_tooth_context refuses a tooth row whose implant
-- flag contradicts its own site rows, and the INSERT branch of
-- save_periodontal_measurements_v2 coalesces an absent implant_context to
-- false. A peri-implant chart whose implant context reached the record through
-- its SITE rows therefore has the flag identical on both sides of the browser
-- diff, so the diff never emits it - and the batch that adds the first surface
-- index for that tooth would insert a NATURAL tooth row underneath peri-implant
-- sites. The two assertions below pin both halves: the omission fails, and
-- stating the flag succeeds and lands the right row.

insert into public.periodontal_examinations (
  id, organization_id, patient_id, encounter_id, examination_kind, status,
  examined_at, examined_by, examined_provider_id
) values (
  'ea800000-0000-0000-0000-000000000015','ea200000-0000-0000-0000-000000000001',
  'ea500000-0000-0000-0000-000000000001',
  (select encounter_id from perio_rpc_scratch where label = 'draft'),
  'MAINTENANCE','DRAFT', statement_timestamp(),
  'ea100000-0000-0000-0000-000000000001','ea600000-0000-0000-0000-000000000001'
);

-- A peri-implant SITE row and deliberately no tooth row. This is the state a
-- reload produces for a chart whose implant context was recorded on the sites.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

select extensions.is(
  (select save.saved_sites from public.save_periodontal_measurements_v2(
     'ea800000-0000-0000-0000-000000000015'::uuid, 1,
     $implant_a${"sites":[{"tooth_fdi":"25","site":"MB","probing_depth_mm":3,"implant_context":true}]}$implant_a$::jsonb,
     'ea900000-0000-0000-0000-000000000070'::uuid) as save),
  1,
  'a peri-implant site is charted before any tooth row exists for that tooth'
);

reset role;

-- The trigger auto-created a context row from the SITE row, so it already
-- carries the implant flag. Removing it reproduces the state the browser sees
-- after a reload of a chart whose tooth row was never written explicitly.
delete from public.periodontal_tooth_measurements
where organization_id = 'ea200000-0000-0000-0000-000000000001'
  and examination_id = 'ea800000-0000-0000-0000-000000000015'
  and tooth_fdi = '25';

select extensions.ok(
  not exists (
    select 1 from public.periodontal_tooth_measurements as tooth
    where tooth.examination_id = 'ea800000-0000-0000-0000-000000000015'::uuid
      and tooth.tooth_fdi = '25'),
  'the peri-implant tooth has site rows and no tooth row of its own'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','ea100000-0000-0000-0000-000000000001',true);

-- Half one: omitting the flag is refused. This is exactly what a batch built
-- from a plain diff would send, and it is why the browser must state the flag
-- outright on an INSERT rather than ask whether it changed.
select extensions.throws_ok(
  $implant_b$select * from public.save_periodontal_measurements_v2(
      'ea800000-0000-0000-0000-000000000015'::uuid, 2,
      '{"tooth":[{"tooth_fdi":"25"}],
        "plaque":[{"tooth_fdi":"25","surface":"BUCCAL","modified_plaque_index":1}]}'::jsonb,
      'ea900000-0000-0000-0000-000000000071'::uuid)$implant_b$,
  '23514','site/tooth implant context mismatch',
  'a minimal tooth row that omits the implant context is refused under peri-implant sites'
);

-- Half two: stating it succeeds, and the row lands as an implant.
select extensions.is(
  (select save.saved_tooth + save.saved_plaque
   from public.save_periodontal_measurements_v2(
     'ea800000-0000-0000-0000-000000000015'::uuid, 2,
     $implant_c${"tooth":[{"tooth_fdi":"25","implant_context":true}],
        "plaque":[{"tooth_fdi":"25","surface":"BUCCAL","modified_plaque_index":1}]}$implant_c$::jsonb,
     'ea900000-0000-0000-0000-000000000072'::uuid) as save),
  2,
  'a minimal tooth row that states the implant context is accepted with its surface index'
);

reset role;

select extensions.ok(
  (select tooth.implant_context and tooth.tooth_present
   from public.periodontal_tooth_measurements as tooth
   where tooth.examination_id = 'ea800000-0000-0000-0000-000000000015'::uuid
     and tooth.tooth_fdi = '25'),
  'the tooth row lands as an implant, so the peri-implant surface index it enables is consistent with its sites'
);

select extensions.ok(
  (select surface.modified_plaque_index = 1
   from public.periodontal_plaque_measurements as surface
   where surface.examination_id = 'ea800000-0000-0000-0000-000000000015'::uuid
     and surface.tooth_fdi = '25' and surface.surface = 'BUCCAL'),
  'the peri-implant surface index the tooth row enabled is on the record'
);

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result
from test_failures;

rollback;
