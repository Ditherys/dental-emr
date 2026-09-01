begin;

select extensions.no_plan();

-- ===========================================================================
-- Task 13 - the canonical chronological progress-record projection.
--
-- Synthetic-only graph. Organization A holds a dentist with an active linked
-- provider at A Main, a dental assistant (patient.clinical.read but NO
-- billing.read), a receptionist (billing.read + payment.record but NO clinical
-- permission at all - see 20260827012800, "Reception gets neither clinical
-- permission"), and a second dentist whose DENTIST role is scoped to A Second
-- only. Organization B is foreign.
--
-- Every fixture row is inserted as postgres; every projection call runs with
-- `set local role authenticated` plus the request jwt claim. Nothing in this
-- file is real patient data.
-- ===========================================================================

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('d1100000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@prog.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('d1100000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','assistant-a@prog.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('d1100000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception-a@prog.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('d1100000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@prog.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('d1100000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-second@prog.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('d1100000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-two@prog.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());

insert into public.organizations (id, legal_name, business_name, slug) values
  ('d1200000-0000-0000-0000-000000000001','PROG Synthetic A Inc.','PROG A','prog-a'),
  ('d1200000-0000-0000-0000-000000000002','PROG Synthetic B Inc.','PROG B','prog-b');

insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('d1300000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','PROG A Main','prog-a-main','PRG-A','1 Synthetic St','Test City','Test Province'),
  ('d1300000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','PROG A Second','prog-a-second','PRG-A2','2 Synthetic St','Test City','Test Province'),
  ('d1300000-0000-0000-0000-000000000003','d1200000-0000-0000-0000-000000000002','PROG B Main','prog-b-main','PRG-B','3 Synthetic St','Test City','Test Province');

insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('d1400000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1100000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('d1400000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','d1100000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('d1400000-0000-0000-0000-000000000003','d1200000-0000-0000-0000-000000000001','d1100000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('d1400000-0000-0000-0000-000000000004','d1200000-0000-0000-0000-000000000002','d1100000-0000-0000-0000-000000000004','active',statement_timestamp()),
  ('d1400000-0000-0000-0000-000000000005','d1200000-0000-0000-0000-000000000001','d1100000-0000-0000-0000-000000000005','active',statement_timestamp()),
  ('d1400000-0000-0000-0000-000000000006','d1200000-0000-0000-0000-000000000001','d1100000-0000-0000-0000-000000000006','active',statement_timestamp());

insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('d1200000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1400000-0000-0000-0000-000000000001','active'),
  ('d1200000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1400000-0000-0000-0000-000000000002','active'),
  ('d1200000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1400000-0000-0000-0000-000000000003','active'),
  ('d1200000-0000-0000-0000-000000000002','d1300000-0000-0000-0000-000000000003','d1400000-0000-0000-0000-000000000004','active'),
  ('d1200000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000002','d1400000-0000-0000-0000-000000000005','active'),
  ('d1200000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1400000-0000-0000-0000-000000000006','active');

insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('d1200000-0000-0000-0000-000000000001'::uuid,'d1400000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'d1100000-0000-0000-0000-000000000001'::uuid),
  ('d1200000-0000-0000-0000-000000000001'::uuid,'d1400000-0000-0000-0000-000000000002'::uuid,'DENTAL_ASSISTANT'::text,null::uuid,'d1100000-0000-0000-0000-000000000001'::uuid),
  ('d1200000-0000-0000-0000-000000000001'::uuid,'d1400000-0000-0000-0000-000000000003'::uuid,'RECEPTIONIST'::text,null::uuid,'d1100000-0000-0000-0000-000000000001'::uuid),
  ('d1200000-0000-0000-0000-000000000002'::uuid,'d1400000-0000-0000-0000-000000000004'::uuid,'DENTIST'::text,null::uuid,'d1100000-0000-0000-0000-000000000004'::uuid),
  ('d1200000-0000-0000-0000-000000000001'::uuid,'d1400000-0000-0000-0000-000000000005'::uuid,'DENTIST'::text,'d1300000-0000-0000-0000-000000000002'::uuid,'d1100000-0000-0000-0000-000000000001'::uuid),
  ('d1200000-0000-0000-0000-000000000001'::uuid,'d1400000-0000-0000-0000-000000000006'::uuid,'DENTIST'::text,null::uuid,'d1100000-0000-0000-0000-000000000001'::uuid)
) as assignment(organization_id, member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;

insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('d1500000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','PRG-A-1','Patient','A1',date '1990-01-01','d1300000-0000-0000-0000-000000000001'),
  ('d1500000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000002','PRG-B-1','Patient','B1',date '1992-03-03',null);

insert into public.providers (id, organization_id, linked_user_id, first_name, last_name, provider_type, status) values
  ('d1600000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1100000-0000-0000-0000-000000000001','Alba','Reyes','REGULAR','active'),
  ('d1600000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000002','d1100000-0000-0000-0000-000000000004','Bea','Cruz','REGULAR','active'),
  ('d1600000-0000-0000-0000-000000000003','d1200000-0000-0000-0000-000000000001','d1100000-0000-0000-0000-000000000006','Cara','Santos','REGULAR','active');

insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('d1200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001',true),
  ('d1200000-0000-0000-0000-000000000002','d1600000-0000-0000-0000-000000000002','d1300000-0000-0000-0000-000000000003',true),
  ('d1200000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000003','d1300000-0000-0000-0000-000000000001',true);

insert into public.procedures (id, organization_id, code, name, status) values
  ('d1700000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','PRG_FILL','Synthetic composite filling','active'),
  ('d1700000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','PRG_ORTHO','Synthetic orthodontic case','active'),
  ('d1700000-0000-0000-0000-000000000003','d1200000-0000-0000-0000-000000000001','PRG_RCT','Synthetic root canal','active'),
  ('d1700000-0000-0000-0000-000000000004','d1200000-0000-0000-0000-000000000001','PRG_CONSULT','Synthetic consultation','active'),
  ('d1700000-0000-0000-0000-000000000005','d1200000-0000-0000-0000-000000000001','PRG_EXTRACT','Synthetic extraction','active'),
  ('d1700000-0000-0000-0000-000000000006','d1200000-0000-0000-0000-000000000001','PRG_HYGIENE','Synthetic hygiene visit','active');

-- ---------------------------------------------------------------------------
-- The clinical spine: one encounter, one finalized note, one prescription.
-- ---------------------------------------------------------------------------

insert into public.clinical_encounters (id, organization_id, branch_id, patient_id, treating_provider_id, status, created_by, created_at, updated_at) values
  ('d1c00000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000001','OPEN','d1100000-0000-0000-0000-000000000001',timestamptz '2026-08-20 01:00:00+00',timestamptz '2026-08-20 01:00:00+00');

insert into public.clinical_notes (id, organization_id, encounter_id, note_type, content, status, finalized_at, created_by, created_at, updated_at) values
  ('d1d00000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1c00000-0000-0000-0000-000000000001','PROGRESS','Synthetic progress note text','FINALIZED',timestamptz '2026-08-20 02:00:00+00','d1100000-0000-0000-0000-000000000001',timestamptz '2026-08-20 01:30:00+00',timestamptz '2026-08-20 02:00:00+00');
insert into public.clinical_notes (id, organization_id, encounter_id, parent_note_id, note_type, content, status, finalized_at, created_by, created_at, updated_at) values
  ('d1d00000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','d1c00000-0000-0000-0000-000000000001','d1d00000-0000-0000-0000-000000000001','AMENDMENT','Synthetic amendment text','FINALIZED',timestamptz '2026-08-21 02:00:00+00','d1100000-0000-0000-0000-000000000001',timestamptz '2026-08-21 01:30:00+00',timestamptz '2026-08-21 02:00:00+00');

-- A DRAFT note, deliberately placed at the SAME instant as the two findings
-- below, so the tie-breaker is exercised across two different source kinds as
-- well as within one.
insert into public.clinical_notes (id, organization_id, encounter_id, note_type, content, status, created_by, created_at, updated_at) values
  ('d1d00000-0000-0000-0000-000000000003','d1200000-0000-0000-0000-000000000001','d1c00000-0000-0000-0000-000000000001','PROGRESS','Synthetic unfinished note text','DRAFT','d1100000-0000-0000-0000-000000000001',timestamptz '2026-08-20 04:00:00+00',timestamptz '2026-08-20 04:00:00+00');

insert into public.prescriptions (id, organization_id, encounter_id, patient_id, provider_id, items, status, finalized_at, created_by, created_at, updated_at) values
  ('d1e00000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1c00000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000001','[]'::jsonb,'FINALIZED',timestamptz '2026-08-20 03:00:00+00','d1100000-0000-0000-0000-000000000001',timestamptz '2026-08-20 02:30:00+00',timestamptz '2026-08-20 03:00:00+00');

-- ---------------------------------------------------------------------------
-- Tooth entries. 11 and 12 share an instant so the tie-breaker is exercised.
-- 13 is voided; the void populates voided_at AND lifecycle, both of which the
-- constraint keeps in step, so the void is detected from lifecycle.
-- ---------------------------------------------------------------------------

insert into public.tooth_clinical_entries (id, organization_id, patient_id, tooth_code, kind, clinical_code, status, lifecycle, provenance, notes, treating_provider_id, encounter_id, effective_at, recorded_at) values
  ('d1b00000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','12','FINDING','CARIES','ACTIVE','OPEN','INTERNAL','Synthetic finding on 12','d1600000-0000-0000-0000-000000000001','d1c00000-0000-0000-0000-000000000001',timestamptz '2026-08-20 04:00:00+00',timestamptz '2026-08-20 04:00:00+00'),
  ('d1b00000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','11','FINDING','CARIES','ACTIVE','OPEN','INTERNAL','Synthetic finding on 11','d1600000-0000-0000-0000-000000000001','d1c00000-0000-0000-0000-000000000001',timestamptz '2026-08-20 04:00:00+00',timestamptz '2026-08-20 04:00:00+00');

insert into public.tooth_clinical_entries (id, organization_id, patient_id, tooth_code, kind, clinical_code, status, lifecycle, provenance, notes, treating_provider_id, encounter_id, effective_at, voided_at, void_reason, recorded_at) values
  ('d1b00000-0000-0000-0000-000000000003','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','13','FINDING','FRACTURE','ACTIVE','VOIDED','INTERNAL','Synthetic mistaken finding','d1600000-0000-0000-0000-000000000001','d1c00000-0000-0000-0000-000000000001',timestamptz '2026-08-20 05:00:00+00',timestamptz '2026-08-22 05:00:00+00','Synthetic void reason',timestamptz '2026-08-20 05:00:00+00');

-- ---------------------------------------------------------------------------
-- One treatment plan.
-- ---------------------------------------------------------------------------

insert into public.treatment_plans (id, organization_id, patient_id, title, status, version, created_by, created_at, updated_at) values
  ('d1800000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','Synthetic plan title','DRAFT',1,'d1100000-0000-0000-0000-000000000001',timestamptz '2026-08-20 06:00:00+00',timestamptz '2026-08-20 06:00:00+00');
insert into public.treatment_plan_items (id, organization_id, plan_id, line_no, procedure_id, tooth_code, description, estimated_fee_centavos) values
  ('d1900000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1800000-0000-0000-0000-000000000001',1,'d1700000-0000-0000-0000-000000000003','36','Root canal on 36',450000);

-- ---------------------------------------------------------------------------
-- Five procedure cases, each with exactly one immutable charge.
--
--   ORTHO     8,000,000 centavos, two 500,000 installments allocated
--   FILLING     150,000 centavos, unpaid until the isolation probe below
--   RCT         450,000 centavos, 50,000 CREDIT adjustment
--   CONSULT     100,000 centavos, voided (allocations reversed with it)
--   EXTRACTION  200,000 centavos, paid then reversed
-- ---------------------------------------------------------------------------

insert into public.charges (id, organization_id, patient_id, branch_id, provider_id, procedure_id, amount_centavos, service_date, posted_at, idempotency_key, created_by) values
  ('d1f00000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000002',8000000,date '2026-08-23',timestamptz '2026-08-23 07:00:00+00','prog-charge-ortho','d1100000-0000-0000-0000-000000000001'),
  ('d1f00000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000001',150000,date '2026-08-24',timestamptz '2026-08-24 07:00:00+00','prog-charge-fill','d1100000-0000-0000-0000-000000000001'),
  ('d1f00000-0000-0000-0000-000000000003','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000003',450000,date '2026-08-25',timestamptz '2026-08-25 07:00:00+00','prog-charge-rct','d1100000-0000-0000-0000-000000000001'),
  ('d1f00000-0000-0000-0000-000000000004','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000004',100000,date '2026-08-26',timestamptz '2026-08-26 07:00:00+00','prog-charge-consult','d1100000-0000-0000-0000-000000000001'),
  ('d1f00000-0000-0000-0000-000000000005','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000005',200000,date '2026-08-27',timestamptz '2026-08-27 07:00:00+00','prog-charge-extract','d1100000-0000-0000-0000-000000000001'),
  -- 300,000 billed, 100,000 credited, then voided. The void withdrew the
  -- ADJUSTED 200,000, never the raw 300,000.
  ('d1f00000-0000-0000-0000-000000000006','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000006',300000,date '2026-08-29',timestamptz '2026-08-29 07:00:00+00','prog-charge-hygiene','d1100000-0000-0000-0000-000000000001');

insert into public.procedure_cases (id, organization_id, patient_id, origin_branch_id, procedure_id, treatment_plan_item_id, charge_id, opened_by, opened_at, status, version) values
  ('d1a00000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000002',null,'d1f00000-0000-0000-0000-000000000001','d1100000-0000-0000-0000-000000000001',timestamptz '2026-08-23 06:30:00+00','OPEN',1),
  ('d1a00000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000001',null,'d1f00000-0000-0000-0000-000000000002','d1100000-0000-0000-0000-000000000001',timestamptz '2026-08-24 06:30:00+00','OPEN',1),
  ('d1a00000-0000-0000-0000-000000000003','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000003','d1900000-0000-0000-0000-000000000001','d1f00000-0000-0000-0000-000000000003','d1100000-0000-0000-0000-000000000001',timestamptz '2026-08-25 06:30:00+00','OPEN',1),
  ('d1a00000-0000-0000-0000-000000000004','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000004',null,'d1f00000-0000-0000-0000-000000000004','d1100000-0000-0000-0000-000000000001',timestamptz '2026-08-26 06:30:00+00','OPEN',1),
  ('d1a00000-0000-0000-0000-000000000005','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000005',null,'d1f00000-0000-0000-0000-000000000005','d1100000-0000-0000-0000-000000000001',timestamptz '2026-08-27 06:30:00+00','OPEN',1),
  ('d1a00000-0000-0000-0000-000000000006','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001','d1700000-0000-0000-0000-000000000006',null,'d1f00000-0000-0000-0000-000000000006','d1100000-0000-0000-0000-000000000001',timestamptz '2026-08-29 06:30:00+00','OPEN',1);

-- The orthodontic treatment was PERFORMED on 2026-08-16 and the charge was
-- POSTED on 2026-08-23. Two facts, two dates, and the projection must never
-- collapse them onto one row.
insert into public.procedure_case_events (id, organization_id, procedure_case_id, event_type, occurred_at, recorded_at, recorded_by, notes) values
  ('d2400000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1a00000-0000-0000-0000-000000000001','TREATMENT',timestamptz '2026-08-16 03:00:00+00',timestamptz '2026-08-23 06:31:00+00','d1100000-0000-0000-0000-000000000001','Synthetic orthodontic bonding'),
  ('d2400000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','d1a00000-0000-0000-0000-000000000001','FOLLOW_UP',timestamptz '2026-08-28 03:00:00+00',timestamptz '2026-08-28 03:00:00+00','d1100000-0000-0000-0000-000000000006','Synthetic orthodontic adjustment'),
  ('d2400000-0000-0000-0000-000000000003','d1200000-0000-0000-0000-000000000001','d1a00000-0000-0000-0000-000000000002','TREATMENT',timestamptz '2026-08-24 03:00:00+00',timestamptz '2026-08-24 03:00:00+00','d1100000-0000-0000-0000-000000000001','Synthetic filling placement');
insert into public.procedure_case_events (id, organization_id, procedure_case_id, event_type, occurred_at, recorded_at, recorded_by, reason, correction_of_event_id) values
  ('d2400000-0000-0000-0000-000000000004','d1200000-0000-0000-0000-000000000001','d1a00000-0000-0000-0000-000000000001','CORRECTION',timestamptz '2026-08-29 03:00:00+00',timestamptz '2026-08-29 03:00:00+00','d1100000-0000-0000-0000-000000000002','Synthetic correction reason','d2400000-0000-0000-0000-000000000002');

-- A completed treatment entry bound to the filling charge, so a case-linked row
-- can name its tooth.
insert into public.tooth_clinical_entries (id, organization_id, patient_id, tooth_code, kind, clinical_code, status, lifecycle, provenance, notes, treating_provider_id, encounter_id, charge_id, effective_at, completed_at, recorded_at) values
  ('d1b00000-0000-0000-0000-000000000004','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','26','TREATMENT','RESTORATION','COMPLETED','OPEN','INTERNAL','Synthetic restoration note','d1600000-0000-0000-0000-000000000001','d1c00000-0000-0000-0000-000000000001','d1f00000-0000-0000-0000-000000000002',timestamptz '2026-08-24 03:00:00+00',timestamptz '2026-08-24 03:00:00+00',timestamptz '2026-08-24 07:05:00+00');

-- Installments on the orthodontic case: two 500,000 allocations.
insert into public.payments (id, organization_id, patient_id, branch_id, payment_method_id, amount_centavos, received_at, received_by, idempotency_key)
select payment.id, 'd1200000-0000-0000-0000-000000000001', 'd1500000-0000-0000-0000-000000000001', 'd1300000-0000-0000-0000-000000000001', method.id, payment.amount, payment.received_at, 'd1100000-0000-0000-0000-000000000001', payment.key
from (values
  ('d2000000-0000-0000-0000-000000000001'::uuid, 500000::bigint, timestamptz '2026-08-23 08:00:00+00', 'prog-pay-ortho-1'),
  ('d2000000-0000-0000-0000-000000000002'::uuid, 500000::bigint, timestamptz '2026-08-30 08:00:00+00', 'prog-pay-ortho-2'),
  ('d2000000-0000-0000-0000-000000000004'::uuid, 200000::bigint, timestamptz '2026-08-27 08:00:00+00', 'prog-pay-extract'),
  ('d2000000-0000-0000-0000-000000000005'::uuid, 300000::bigint, timestamptz '2026-08-31 08:00:00+00', 'prog-pay-refunded'),
  ('d2000000-0000-0000-0000-000000000006'::uuid, 100000::bigint, timestamptz '2026-08-26 08:00:00+00', 'prog-pay-consult')
) as payment(id, amount, received_at, key)
cross join lateral (select id from public.payment_methods where organization_id='d1200000-0000-0000-0000-000000000001' and code='CASH') as method;

insert into public.payment_allocations (id, organization_id, payment_id, charge_id, patient_id, amount_centavos, allocated_at, allocated_by, idempotency_key) values
  ('d2100000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000001','d1f00000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001',500000,timestamptz '2026-08-23 08:01:00+00','d1100000-0000-0000-0000-000000000001','prog-alloc-ortho-1'),
  ('d2100000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000002','d1f00000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001',500000,timestamptz '2026-08-30 08:01:00+00','d1100000-0000-0000-0000-000000000001','prog-alloc-ortho-2'),
  ('d2100000-0000-0000-0000-000000000004','d1200000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000004','d1f00000-0000-0000-0000-000000000005','d1500000-0000-0000-0000-000000000001',200000,timestamptz '2026-08-27 08:01:00+00','d1100000-0000-0000-0000-000000000001','prog-alloc-extract'),
  ('d2100000-0000-0000-0000-000000000005','d1200000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000006','d1f00000-0000-0000-0000-000000000004','d1500000-0000-0000-0000-000000000001',100000,timestamptz '2026-08-26 08:01:00+00','d1100000-0000-0000-0000-000000000001','prog-alloc-consult');

-- The extraction allocation is reversed: paid returns to zero from the ledger.
insert into public.payment_allocation_reversals (id, organization_id, allocation_id, cause, amount_centavos, reason, reversed_at, reversed_by, idempotency_key) values
  ('d2800000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d2100000-0000-0000-0000-000000000004','MANUAL',200000,'Synthetic reversal reason',timestamptz '2026-09-01 08:00:00+00','d1100000-0000-0000-0000-000000000001','prog-reversal-extract'),
  -- public.void_charge reverses every allocation in the SAME transaction as
  -- the void. The fixture mirrors that, so the voided consultation is a
  -- voided charge that HAD been paid rather than one that trivially never was.
  ('d2800000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','d2100000-0000-0000-0000-000000000005','VOID',100000,'Synthetic void reversal reason',timestamptz '2026-08-26 10:00:00+00','d1100000-0000-0000-0000-000000000001','prog-reversal-consult');

insert into public.payment_refunds (id, organization_id, payment_id, patient_id, amount_centavos, reason, refunded_at, refunded_by, idempotency_key) values
  ('d2700000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000005','d1500000-0000-0000-0000-000000000001',300000,'Synthetic refund reason',timestamptz '2026-09-01 09:00:00+00','d1100000-0000-0000-0000-000000000001','prog-refund');

insert into public.charge_adjustments (id, organization_id, charge_id, direction, amount_centavos, reason, occurred_at, created_by, idempotency_key) values
  ('d2500000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1f00000-0000-0000-0000-000000000003','CREDIT',50000,'Synthetic goodwill adjustment',timestamptz '2026-08-25 09:00:00+00','d1100000-0000-0000-0000-000000000001','prog-adjust-rct'),
  ('d2500000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','d1f00000-0000-0000-0000-000000000006','CREDIT',100000,'Synthetic hygiene credit',timestamptz '2026-08-29 09:00:00+00','d1100000-0000-0000-0000-000000000001','prog-adjust-hygiene');

insert into public.charge_voids (id, organization_id, charge_id, reason, voided_at, voided_by) values
  ('d2600000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1f00000-0000-0000-0000-000000000004','Synthetic charge void reason',timestamptz '2026-08-26 10:00:00+00','d1100000-0000-0000-0000-000000000001'),
  ('d2600000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','d1f00000-0000-0000-0000-000000000006','Synthetic hygiene void reason',timestamptz '2026-08-29 10:00:00+00','d1100000-0000-0000-0000-000000000001');

-- The root-canal charge was posted under clinician A and its attribution was
-- later CORRECTED to clinician C through the append-only correction ledger.
-- public.charges is immutable, so charge.provider_id still names A.
insert into public.charge_attribution_corrections (id, organization_id, charge_id, previous_provider_id, corrected_provider_id, previous_branch_id, corrected_branch_id, previous_service_date, corrected_service_date, reason, occurred_at, corrected_by, idempotency_key) values
  ('d2a00000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1f00000-0000-0000-0000-000000000003','d1600000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000003','d1300000-0000-0000-0000-000000000001','d1300000-0000-0000-0000-000000000001',date '2026-08-25',date '2026-08-25','Synthetic attribution correction reason',timestamptz '2026-08-31 07:00:00+00','d1100000-0000-0000-0000-000000000001','prog-attr-rct');

-- ---------------------------------------------------------------------------
-- Periodontal examination and clinical photographs.
-- ---------------------------------------------------------------------------

insert into public.periodontal_examinations (id, organization_id, patient_id, encounter_id, examination_kind, status, version, examined_at, examined_by, examined_provider_id, finalized_at, finalized_by, finalized_provider_id, notes, recorded_at) values
  ('d2200000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1c00000-0000-0000-0000-000000000001','INITIAL','FINAL',1,timestamptz '2026-08-20 07:00:00+00','d1100000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000001',timestamptz '2026-08-20 07:30:00+00','d1100000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000001','Synthetic periodontal note',timestamptz '2026-08-20 07:00:00+00');

insert into public.periodontal_examinations (id, organization_id, patient_id, encounter_id, examination_kind, status, version, examined_at, examined_by, examined_provider_id, notes, recorded_at) values
  ('d2200000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d1c00000-0000-0000-0000-000000000001','MAINTENANCE','DRAFT',1,timestamptz '2026-08-28 07:00:00+00','d1100000-0000-0000-0000-000000000001','d1600000-0000-0000-0000-000000000001','Synthetic unfinished periodontal note',timestamptz '2026-08-28 07:00:00+00');

insert into public.file_objects (id, organization_id, patient_id, object_key, mime_type, size_bytes, uploaded_by, status) values
  ('d2900000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','org/d1200000-0000-0000-0000-000000000001/patients/d1500000-0000-0000-0000-000000000001/files/d2900000-0000-0000-0000-000000000001','image/jpeg',1024,'d1100000-0000-0000-0000-000000000001','available'),
  ('d2900000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','org/d1200000-0000-0000-0000-000000000001/patients/d1500000-0000-0000-0000-000000000001/files/d2900000-0000-0000-0000-000000000002','image/jpeg',2048,'d1100000-0000-0000-0000-000000000001','available');

insert into public.clinical_photographs (id, organization_id, patient_id, source_file_id, procedure_case_id, category, display_filename, original_client_filename, capture_at, tooth_codes, note, created_by) values
  ('d2300000-0000-0000-0000-000000000001','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d2900000-0000-0000-0000-000000000001','d1a00000-0000-0000-0000-000000000002','BEFORE','before.jpg','before.jpg',timestamptz '2026-08-24 02:00:00+00',array['26'],'Synthetic photo note','d1100000-0000-0000-0000-000000000001');
insert into public.clinical_photographs (id, organization_id, patient_id, source_file_id, procedure_case_id, category, display_filename, original_client_filename, capture_at, tooth_codes, note, created_by, archived_at, archived_by, archive_reason) values
  ('d2300000-0000-0000-0000-000000000002','d1200000-0000-0000-0000-000000000001','d1500000-0000-0000-0000-000000000001','d2900000-0000-0000-0000-000000000002',null,'DIAGNOSTIC','diagnostic.jpg','diagnostic.jpg',timestamptz '2026-08-25 02:00:00+00',array['36'],null,'d1100000-0000-0000-0000-000000000001',timestamptz '2026-09-01 02:00:00+00','d1100000-0000-0000-0000-000000000001','Synthetic archive reason');

create temp table prog_payload (seq integer primary key, payload jsonb);
create temp table prog_scalar (seq integer primary key, value text);
grant select, insert on prog_payload to authenticated;
grant select, insert on prog_scalar to authenticated;

-- ===========================================================================
-- 1. Boundary
-- ===========================================================================

select extensions.ok(
  has_function_privilege('authenticated','public.get_clinical_progress_record_v1(uuid,uuid,integer,integer)','execute')
  and not has_function_privilege('anon','public.get_clinical_progress_record_v1(uuid,uuid,integer,integer)','execute')
  and not has_function_privilege('service_role','public.get_clinical_progress_record_v1(uuid,uuid,integer,integer)','execute')
  and not has_function_privilege('public','public.get_clinical_progress_record_v1(uuid,uuid,integer,integer)','execute'),
  'only authenticated may execute the clinical progress projection'
);

select extensions.ok(
  (select proc.prosecdef
      and proc.proconfig = array['search_path=""']::text[]
      and proc.provolatile = 's'
   from pg_proc as proc
   where proc.oid = 'public.get_clinical_progress_record_v1(uuid,uuid,integer,integer)'::regprocedure),
  'the clinical progress projection is a stable SECURITY DEFINER with an empty search path'
);

select extensions.ok(
  (select proc.pronargs = 4
   from pg_proc as proc
   where proc.oid = 'public.get_clinical_progress_record_v1(uuid,uuid,integer,integer)'::regprocedure),
  'the projection accepts patient, branch and bounded paging only - never an organization'
);

select extensions.ok(
  not exists (
    select 1 from (values ('public'),('anon'),('authenticated'),('service_role')) as viewer(role_name)
    where has_function_privilege(viewer.role_name,'private.clinical_progress_case_money(uuid,uuid)','execute')
       or has_function_privilege(viewer.role_name,'private.clinical_progress_case_teeth(uuid,uuid)','execute')
  ),
  'the progress-record money and tooth helpers are not browser or service callable'
);

-- ===========================================================================
-- 2. Negative authorization
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1100000-0000-0000-0000-000000000003',true);

-- Reception holds billing.read and payment.record but no clinical permission at
-- all (20260827012800). It may record a payment; it may not read the clinical
-- progress record.
select extensions.throws_ok(
  $$select * from public.get_clinical_progress_record_v1(
      'd1500000-0000-0000-0000-000000000001'::uuid,
      'd1300000-0000-0000-0000-000000000001'::uuid, 100, 0)$$,
  '42501','not authorized',
  'a receptionist may not read the clinical progress record'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1100000-0000-0000-0000-000000000004',true);

select extensions.throws_ok(
  $$select * from public.get_clinical_progress_record_v1(
      'd1500000-0000-0000-0000-000000000001'::uuid,
      'd1300000-0000-0000-0000-000000000003'::uuid, 100, 0)$$,
  '42501','not authorized',
  'a dentist in another organization may not read this patient progress record'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1100000-0000-0000-0000-000000000005',true);

select extensions.throws_ok(
  $$select * from public.get_clinical_progress_record_v1(
      'd1500000-0000-0000-0000-000000000001'::uuid,
      'd1300000-0000-0000-0000-000000000001'::uuid, 100, 0)$$,
  '42501','not authorized',
  'a dentist whose role is scoped to another branch may not act at PROG A Main'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1100000-0000-0000-0000-000000000001',true);

select extensions.throws_ok(
  $$select * from public.get_clinical_progress_record_v1(
      'd1500000-0000-0000-0000-000000000002'::uuid,
      'd1300000-0000-0000-0000-000000000001'::uuid, 100, 0)$$,
  '42501','not authorized',
  'a foreign patient named at an authorized branch is refused rather than reported absent'
);

select extensions.throws_ok(
  $$select * from public.get_clinical_progress_record_v1(
      'd1500000-0000-0000-0000-000000000001'::uuid,
      'd1300000-0000-0000-0000-000000000001'::uuid, 0, 0)$$,
  '22023','invalid input',
  'a page size below the bound is refused'
);

select extensions.throws_ok(
  $$select * from public.get_clinical_progress_record_v1(
      'd1500000-0000-0000-0000-000000000001'::uuid,
      'd1300000-0000-0000-0000-000000000001'::uuid, 201, 0)$$,
  '22023','invalid input',
  'a page size above the bound is refused'
);

select extensions.throws_ok(
  $$select * from public.get_clinical_progress_record_v1(
      'd1500000-0000-0000-0000-000000000001'::uuid,
      'd1300000-0000-0000-0000-000000000001'::uuid, 100, -1)$$,
  '22023','invalid input',
  'a negative page offset is refused'
);

-- ===========================================================================
-- 3. The projection itself, read by the treating dentist
-- ===========================================================================

insert into prog_payload (seq, payload)
select 1, payload from public.get_clinical_progress_record_v1(
  'd1500000-0000-0000-0000-000000000001'::uuid,
  'd1300000-0000-0000-0000-000000000001'::uuid, 200, 0);
reset role;

select extensions.is(
  (select count(distinct row_value->>'eventType')::integer
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1),
  17,
  'every event type this synthetic graph contains is projected'
);

-- PHOTO_RENAME is the eighteenth member of the row contract and is deliberately
-- never produced: renaming a photograph updates display_filename in place and
-- bumps a version, so no append-only source records that it happened, and the
-- audit-metadata allow-list deliberately carries no filename. Inventing the row
-- from the security audit log would put a clinical chronology on top of a
-- security artifact and still say nothing about what changed.
select extensions.ok(
  (select not (payload->'rows') @> '[{"eventType":"PHOTO_RENAME"}]'::jsonb
   from prog_payload where seq = 1),
  'no event type is fabricated from a source that does not record it'
);

select extensions.ok(
  (select (payload->'rows') @> '[{"eventType":"ENCOUNTER"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"NOTE"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"PRESCRIPTION"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"FINDING"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"PLAN"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"TREATMENT"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"FOLLOW_UP"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"PERIODONTAL"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"PHOTO"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"PHOTO_ARCHIVE"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"CHARGE"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"PAYMENT"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"ALLOCATION"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"REFUND"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"REVERSAL"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"ADJUSTMENT"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"VOID"}]'::jsonb
   from prog_payload where seq = 1),
  'the union covers the encounter, note, prescription, finding, plan, treatment, follow-up, periodontal, photo, ledger and correction sources'
);

select extensions.ok(
  (select bool_and(this.occurred_at >= previous.occurred_at)
   from (
     select (row_value->>'occurredAt')::timestamptz as occurred_at,
            row_number() over () as position
     from prog_payload, jsonb_array_elements(payload->'rows') with ordinality as element(row_value, ordinal)
     where seq = 1
   ) as this
   join (
     select (row_value->>'occurredAt')::timestamptz as occurred_at,
            row_number() over () as position
     from prog_payload, jsonb_array_elements(payload->'rows') with ordinality as element(row_value, ordinal)
     where seq = 1
   ) as previous on previous.position = this.position - 1),
  'the record is chronological ascending - oldest first'
);

-- A draft note and two findings share an instant, so both legs of the
-- tie-breaker are exercised: source kind first, then source id within a kind.
select extensions.is(
  (select string_agg(row_value->>'eventId', ',' order by ordinal)
   from prog_payload, jsonb_array_elements(payload->'rows') with ordinality as element(row_value, ordinal)
   where seq = 1
     and (row_value->>'occurredAt')::timestamptz = timestamptz '2026-08-20 04:00:00+00'),
  'clinical_note:d1d00000-0000-0000-0000-000000000003,tooth_clinical_entry:d1b00000-0000-0000-0000-000000000001,tooth_clinical_entry:d1b00000-0000-0000-0000-000000000002',
  'events of DIFFERENT source kinds at one instant order by source kind, so the tie-breaker is total across the union'
);
select extensions.is(
  (select string_agg(row_value->>'sourceId', ',' order by ordinal)
   from prog_payload, jsonb_array_elements(payload->'rows') with ordinality as element(row_value, ordinal)
   where seq = 1
     and (row_value->>'occurredAt')::timestamptz = timestamptz '2026-08-20 04:00:00+00'
     and row_value->>'sourceKind' = 'tooth_clinical_entry'),
  'd1b00000-0000-0000-0000-000000000001,d1b00000-0000-0000-0000-000000000002',
  'two events of the SAME source kind at one instant order by source id'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1100000-0000-0000-0000-000000000001',true);
insert into prog_payload (seq, payload)
select 2, payload from public.get_clinical_progress_record_v1(
  'd1500000-0000-0000-0000-000000000001'::uuid,
  'd1300000-0000-0000-0000-000000000001'::uuid, 200, 0);
reset role;

select extensions.is(
  (select payload from prog_payload where seq = 2),
  (select payload from prog_payload where seq = 1),
  'the same request returns a byte-identical record, so the ordering is repeatable and not incidental'
);

-- ===========================================================================
-- 4. Service dates and posting dates are different facts
-- ===========================================================================

select extensions.is(
  (select (row_value->>'occurredAt')::timestamptz
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd2400000-0000-0000-0000-000000000001'),
  timestamptz '2026-08-16 03:00:00+00',
  'the treatment row keeps the date the treatment was performed'
);

select extensions.is(
  (select (row_value->>'occurredAt')::timestamptz
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd1f00000-0000-0000-0000-000000000001'),
  timestamptz '2026-08-23 07:00:00+00',
  'the charge row keeps the date the charge was posted, which is a different row and a different date'
);

select extensions.ok(
  (select count(*)::integer = 2 and count(distinct row_value->>'occurredAt')::integer = 2
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1
     and row_value->>'sourceId' in ('d2400000-0000-0000-0000-000000000001','d1f00000-0000-0000-0000-000000000001')),
  'the service fact and the posting fact are two rows at two dates and are never collapsed into one'
);

-- ===========================================================================
-- 5. Attribution, tooth and procedure identity
-- ===========================================================================

select extensions.is(
  (select row_value->>'providerDisplay'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd1b00000-0000-0000-0000-000000000001'),
  'Alba Reyes',
  'a finding names the treating provider it was recorded under'
);

select extensions.is(
  (select row_value->'toothCodes'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd1b00000-0000-0000-0000-000000000001'),
  '[11]'::jsonb,
  'a tooth entry names its tooth as an FDI number'
);

select extensions.is(
  (select row_value->>'procedureLabel'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd2400000-0000-0000-0000-000000000001'),
  'Synthetic orthodontic case',
  'a case-linked event names the canonical procedure of its case'
);

select extensions.is(
  (select row_value->'toothCodes'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd2400000-0000-0000-0000-000000000003'),
  '[26]'::jsonb,
  'a case-linked event inherits the teeth its own charge treated'
);

select extensions.is(
  (select row_value->>'description'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd1d00000-0000-0000-0000-000000000001'),
  'Synthetic progress note text',
  'a finalized note carries its own canonical text and no invented label'
);

-- The orthodontic charge names clinician A. The follow-up on that case was
-- performed and recorded by clinician C. The record must name C.
select extensions.is(
  (select row_value->>'providerDisplay'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd2400000-0000-0000-0000-000000000002'),
  'Cara Santos',
  'a follow-up names the clinician who recorded it, not the clinician on the case charge'
);
select extensions.ok(
  (select (select row_value->>'providerDisplay'
           from prog_payload, jsonb_array_elements(payload->'rows') as row_value
           where seq = 1 and row_value->>'sourceId' = 'd2400000-0000-0000-0000-000000000002')
       is distinct from
          (select row_value->>'providerDisplay'
           from prog_payload, jsonb_array_elements(payload->'rows') as row_value
           where seq = 1 and row_value->>'sourceId' = 'd1f00000-0000-0000-0000-000000000001')),
  'the follow-up and its case charge report different clinicians, so no attribution is inherited from the charge'
);
select extensions.is(
  (select row_value->>'providerDisplay'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd2400000-0000-0000-0000-000000000001'),
  'Alba Reyes',
  'a treatment event names the clinician who recorded it'
);
select extensions.ok(
  (select row_value->>'providerDisplay' is null
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd2400000-0000-0000-0000-000000000004'),
  'an event recorded by someone who is not a provider here reports no clinician rather than borrowing one'
);
select extensions.is(
  (select row_value->>'providerDisplay'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceKind' = 'clinical_photograph'
     and row_value->>'sourceId' = 'd2300000-0000-0000-0000-000000000001'),
  'Alba Reyes',
  'a photograph names the clinician who took it rather than discarding the attribution it holds'
);

-- public.charges is immutable, so charge.provider_id keeps naming the clinician
-- the charge was POSTED under. Attribution is corrected through the append-only
-- charge_attribution_corrections ledger, and the record must show the standing
-- attribution rather than the superseded one.
select extensions.is(
  (select row_value->>'providerDisplay'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceKind' = 'charge'
     and row_value->>'sourceId' = 'd1f00000-0000-0000-0000-000000000003'),
  'Cara Santos',
  'a charge whose attribution was corrected names the corrected clinician, not the superseded one'
);
select extensions.is(
  (select row_value->>'providerDisplay'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceKind' = 'charge'
     and row_value->>'sourceId' = 'd1f00000-0000-0000-0000-000000000001'),
  'Alba Reyes',
  'an uncorrected charge still names the clinician it was posted under'
);

select extensions.is(
  (select count(*)::integer
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd1d00000-0000-0000-0000-000000000002'
     and row_value->>'description' = 'Synthetic amendment text'),
  1,
  'an amendment is its own row rather than an overwrite of the note it amends'
);

-- ===========================================================================
-- 5b. Draft clinical content is present but never mistakable for signed history
-- ===========================================================================

select extensions.ok(
  (select (row_value->>'finalized')::boolean
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd1d00000-0000-0000-0000-000000000001'),
  'a finalized note reports itself as finalized'
);
select extensions.ok(
  (select not (row_value->>'finalized')::boolean
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd1d00000-0000-0000-0000-000000000003'),
  'a DRAFT note appears in the record and reports itself as unfinished'
);
select extensions.ok(
  (select (row_value->>'finalized')::boolean
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd2200000-0000-0000-0000-000000000001'),
  'a FINAL periodontal examination reports itself as finalized'
);
select extensions.ok(
  (select not (row_value->>'finalized')::boolean
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd2200000-0000-0000-0000-000000000002'),
  'a DRAFT periodontal examination is no longer silently dropped, and reports itself as unfinished'
);
select extensions.ok(
  (select not (row_value->>'finalized')::boolean
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceKind' = 'clinical_encounter'),
  'an open visit reports itself as unfinished'
);
select extensions.ok(
  (select not (row_value->>'finalized')::boolean
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceKind' = 'treatment_plan'),
  'a DRAFT treatment plan reports itself as unfinished'
);
select extensions.ok(
  (select bool_and(row_value->>'finalized' is null)
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceKind' in ('tooth_clinical_entry','charge','payment','payment_allocation')),
  'a source with no draft lifecycle says nothing about finalization rather than guessing'
);

-- ===========================================================================
-- 6. Money is derived from the ledger, per procedure case, at read time
-- ===========================================================================

select extensions.is(
  (select row_value->>'chargeMinor' || '/' || (row_value->>'paidMinor') || '/' || (row_value->>'balanceMinor')
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd1f00000-0000-0000-0000-000000000001'),
  '8000000/1000000/7000000',
  'the orthodontic case reports its ledger position: charge, two allocated installments, and the remainder'
);

select extensions.is(
  (select row_value->>'chargeMinor' || '/' || (row_value->>'paidMinor') || '/' || (row_value->>'balanceMinor')
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd1f00000-0000-0000-0000-000000000003'),
  '400000/0/400000',
  'a credit adjustment reduces the case charge through the ledger rather than by editing the immutable charge'
);

select extensions.is(
  (select row_value->>'chargeMinor' || '/' || (row_value->>'paidMinor') || '/' || (row_value->>'balanceMinor')
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd1f00000-0000-0000-0000-000000000004'),
  '0/0/0',
  'a voided charge still appears as a row but owes nothing'
);

-- Not a trivial pass: that charge WAS allocated against before it was voided,
-- and the allocation is still in the record. The zero paid comes from the
-- reversal public.void_charge writes in the same transaction, not from the
-- absence of any payment.
select extensions.ok(
  (select (payload->'rows') @> '[{"sourceKind":"payment_allocation","sourceId":"d2100000-0000-0000-0000-000000000005"}]'::jsonb
      and (payload->'rows') @> '[{"sourceKind":"payment_allocation_reversal","sourceId":"d2800000-0000-0000-0000-000000000002"}]'::jsonb
   from prog_payload where seq = 1),
  'the voided charge had been allocated against, and both the allocation and its reversal survive in the record'
);

select extensions.is(
  (select row_value->>'chargeMinor' || '/' || (row_value->>'paidMinor') || '/' || (row_value->>'balanceMinor')
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd1f00000-0000-0000-0000-000000000005'),
  '200000/0/200000',
  'a reversed allocation returns the case to owing through the ledger, not through a stored balance'
);

select extensions.ok(
  (select bool_and(row_value->>'balanceMinor' is null)
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceKind' in ('clinical_encounter','clinical_note','prescription','treatment_plan','periodontal_examination')),
  'a purely clinical event carries no money at all rather than a zero that reads as settled'
);

select extensions.ok(
  (select bool_and((row_value->>'chargeMinor')::bigint - (row_value->>'paidMinor')::bigint = (row_value->>'balanceMinor')::bigint)
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'balanceMinor' is not null),
  'every projected balance is exactly its own charge minus its own paid, so no row carries a running total'
);

select extensions.ok(
  (select bool_and(row_value->>'currency' = 'PHP')
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1),
  'every row states its currency'
);

-- The defect this replaces: an ALLOCATION row showed the case position in a
-- column headed "Paid", so a 5,000 installment read as 10,000 once a second
-- installment had been applied. The line amount and the case position are now
-- two different values on the same row, and the test pins both.
select extensions.is(
  (select (row_value->>'lineAmountMinor') || ' of ' || (row_value->>'paidMinor')
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd2100000-0000-0000-0000-000000000001'),
  '500000 of 1000000',
  'an allocation states the amount IT applied, distinct from the case total paid to date'
);
select extensions.is(
  (select row_value->>'lineAmountMinor'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd2000000-0000-0000-0000-000000000001'),
  '500000',
  'a payment states the amount received'
);
select extensions.is(
  (select row_value->>'lineAmountMinor'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd2700000-0000-0000-0000-000000000001'),
  '-300000',
  'a refund states the amount returned, signed as a withdrawal'
);
select extensions.is(
  (select row_value->>'lineAmountMinor'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd2500000-0000-0000-0000-000000000001'),
  '-50000',
  'a credit adjustment states its own amount, signed by its effect on what is owed'
);
select extensions.is(
  (select row_value->>'lineAmountMinor'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd2800000-0000-0000-0000-000000000001'),
  '-200000',
  'an allocation reversal states the amount it un-applied'
);
select extensions.is(
  (select row_value->>'lineAmountMinor'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceId' = 'd1f00000-0000-0000-0000-000000000001'),
  '8000000',
  'a charge states the amount billed'
);
-- 300,000 billed, 100,000 credited, then voided. The void withdrew 200,000, and
-- stating the raw 300,000 would overstate what actually moved.
select extensions.is(
  (select row_value->>'lineAmountMinor'
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceKind' = 'charge_void'
     and row_value->>'sourceId' = 'd2600000-0000-0000-0000-000000000002'),
  '-200000',
  'a void of an adjusted charge withdraws the adjusted amount, never the raw one'
);
select extensions.is(
  (select row_value->>'chargeMinor' || '/' || (row_value->>'paidMinor') || '/' || (row_value->>'balanceMinor')
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceKind' = 'charge'
     and row_value->>'sourceId' = 'd1f00000-0000-0000-0000-000000000006'),
  '0/0/0',
  'the credited-then-voided case owes nothing, and its position and its void line agree'
);
select extensions.ok(
  (select bool_and(row_value->>'lineAmountMinor' is null)
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 1 and row_value->>'sourceKind' in
     ('clinical_encounter','clinical_note','prescription','treatment_plan',
      'periodontal_examination','tooth_clinical_entry','clinical_photograph')),
  'a clinical event moves no money and says so, rather than reporting a zero'
);

-- The isolation proof. The orthodontic position is captured, an UNRELATED
-- filling is paid in full, and the orthodontic position is re-asserted.
insert into prog_scalar (seq, value)
select 1, row_value->>'chargeMinor' || '/' || (row_value->>'paidMinor') || '/' || (row_value->>'balanceMinor')
from prog_payload, jsonb_array_elements(payload->'rows') as row_value
where seq = 1 and row_value->>'sourceId' = 'd1f00000-0000-0000-0000-000000000001';

insert into public.payments (id, organization_id, patient_id, branch_id, payment_method_id, amount_centavos, received_at, received_by, idempotency_key)
select 'd2000000-0000-0000-0000-000000000003', 'd1200000-0000-0000-0000-000000000001', 'd1500000-0000-0000-0000-000000000001', 'd1300000-0000-0000-0000-000000000001', method.id, 150000, timestamptz '2026-09-01 10:00:00+00', 'd1100000-0000-0000-0000-000000000001', 'prog-pay-fill'
from (select id from public.payment_methods where organization_id='d1200000-0000-0000-0000-000000000001' and code='CASH') as method;
insert into public.payment_allocations (id, organization_id, payment_id, charge_id, patient_id, amount_centavos, allocated_at, allocated_by, idempotency_key) values
  ('d2100000-0000-0000-0000-000000000003','d1200000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000003','d1f00000-0000-0000-0000-000000000002','d1500000-0000-0000-0000-000000000001',150000,timestamptz '2026-09-01 10:01:00+00','d1100000-0000-0000-0000-000000000001','prog-alloc-fill');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1100000-0000-0000-0000-000000000001',true);
insert into prog_payload (seq, payload)
select 3, payload from public.get_clinical_progress_record_v1(
  'd1500000-0000-0000-0000-000000000001'::uuid,
  'd1300000-0000-0000-0000-000000000001'::uuid, 200, 0);
reset role;

select extensions.is(
  (select row_value->>'chargeMinor' || '/' || (row_value->>'paidMinor') || '/' || (row_value->>'balanceMinor')
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 3 and row_value->>'sourceId' = 'd1f00000-0000-0000-0000-000000000001'),
  (select value from prog_scalar where seq = 1),
  'paying an unrelated filling in full leaves the orthodontic case position byte-identical'
);

select extensions.is(
  (select row_value->>'chargeMinor' || '/' || (row_value->>'paidMinor') || '/' || (row_value->>'balanceMinor')
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 3 and row_value->>'sourceId' = 'd1f00000-0000-0000-0000-000000000002'),
  '150000/150000/0',
  'the filling is settled by its own allocation only'
);

select extensions.is(
  (select row_value->>'chargeMinor' || '/' || (row_value->>'paidMinor') || '/' || (row_value->>'balanceMinor')
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 3 and row_value->>'sourceId' = 'd1f00000-0000-0000-0000-000000000003'),
  '400000/0/400000',
  'the unrelated root-canal case is untouched by the filling payment as well'
);

-- ===========================================================================
-- 7. Financial rows are gated on billing.read
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1100000-0000-0000-0000-000000000002',true);
insert into prog_payload (seq, payload)
select 4, payload from public.get_clinical_progress_record_v1(
  'd1500000-0000-0000-0000-000000000001'::uuid,
  'd1300000-0000-0000-0000-000000000001'::uuid, 200, 0);
reset role;

select extensions.ok(
  (select not (payload->'rows') @> '[{"eventType":"CHARGE"}]'::jsonb
      and not (payload->'rows') @> '[{"eventType":"PAYMENT"}]'::jsonb
      and not (payload->'rows') @> '[{"eventType":"ALLOCATION"}]'::jsonb
      and not (payload->'rows') @> '[{"eventType":"REFUND"}]'::jsonb
      and not (payload->'rows') @> '[{"eventType":"ADJUSTMENT"}]'::jsonb
      and not (payload->'rows') @> '[{"eventType":"REVERSAL"}]'::jsonb
   from prog_payload where seq = 4),
  'a dental assistant with clinical read but no billing read sees no ledger event at all'
);

select extensions.ok(
  (select bool_and(row_value->>'chargeMinor' is null and row_value->>'paidMinor' is null
                   and row_value->>'balanceMinor' is null and row_value->>'lineAmountMinor' is null)
   from prog_payload, jsonb_array_elements(payload->'rows') as row_value
   where seq = 4),
  'a caller without billing read is shown no money on any clinical row either, line amount included'
);

select extensions.ok(
  (select (payload->'rows') @> '[{"eventType":"TREATMENT"}]'::jsonb
      and (payload->'rows') @> '[{"eventType":"FINDING"}]'::jsonb
      and not (payload->>'financialVisible')::boolean
   from prog_payload where seq = 4),
  'the clinical chronology is still complete for that caller, and the payload says the money is withheld'
);

-- ===========================================================================
-- 7b. Positive branch access
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1100000-0000-0000-0000-000000000005',true);
insert into prog_payload (seq, payload)
select 7, payload from public.get_clinical_progress_record_v1(
  'd1500000-0000-0000-0000-000000000001'::uuid,
  'd1300000-0000-0000-0000-000000000002'::uuid, 200, 0);
reset role;

select extensions.ok(
  (select jsonb_array_length(payload->'rows') > 0 and (payload->>'financialVisible')::boolean
   from prog_payload where seq = 7),
  'the branch-scoped dentist refused at PROG A Main reads the same patient successfully AT the branch his role covers'
);

-- ===========================================================================
-- 8. Bounded pagination
-- ===========================================================================

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','d1100000-0000-0000-0000-000000000001',true);
insert into prog_payload (seq, payload)
select 5, payload from public.get_clinical_progress_record_v1(
  'd1500000-0000-0000-0000-000000000001'::uuid,
  'd1300000-0000-0000-0000-000000000001'::uuid, 3, 0);
insert into prog_payload (seq, payload)
select 6, payload from public.get_clinical_progress_record_v1(
  'd1500000-0000-0000-0000-000000000001'::uuid,
  'd1300000-0000-0000-0000-000000000001'::uuid, 3, 3);
reset role;

select extensions.ok(
  (select jsonb_array_length(payload->'rows') = 3 and (payload->>'hasMore')::boolean
   from prog_payload where seq = 5),
  'a bounded page returns exactly the requested rows and says more remain'
);

select extensions.is(
  (select (payload->'rows'->0->>'eventId') from prog_payload where seq = 6),
  (select (payload->'rows'->3->>'eventId') from prog_payload where seq = 3),
  'the second page continues the one chronology rather than restarting it'
);

-- ===========================================================================
-- 9. The projection writes nothing, and records nothing about the clinical
--    content it returned
-- ===========================================================================

select extensions.is(
  (select count(*)::integer from public.audit_events
   where organization_id = 'd1200000-0000-0000-0000-000000000001'),
  0,
  'reading the clinical progress record emits no audit event, so no clinical content can reach the audit log through it'
);

select extensions.ok(
  (select proc.prosrc !~* '\minsert into\M' and proc.prosrc !~* '\mupdate\s+public\.' and proc.prosrc !~* '\mdelete\s+from\M'
   from pg_proc as proc
   where proc.oid = 'public.get_clinical_progress_record_v1(uuid,uuid,integer,integer)'::regprocedure),
  'the projection body contains no write at all'
);

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;
