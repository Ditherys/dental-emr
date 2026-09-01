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

select extensions.ok(
  (select exam.amendment_reason is not null and exam.status = 'DRAFT'
     and exam.examined_provider_id = 'ea600000-0000-0000-0000-000000000002'::uuid
   from public.periodontal_examinations as exam
   where exam.id = 'ea800000-0000-0000-0000-00000000000c'),
  'the adopted successor gains the bounded amendment reason it never had and the amending clinician''s own provider'
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

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'\n') end as p1_test_result
from test_failures;

rollback;
