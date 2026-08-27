begin;

select extensions.no_plan();

-- Synthetic-only P18-02 graph, GUC-as-postgres. dentist-a holds recall.manage
-- and recall.read (DENTIST), reception-a holds recall.read only
-- (RECEPTIONIST), billing-a holds no recall permission (BILLING), and
-- dentist-b is foreign (DENTIST in Org B). patient-a1 carries primary MOBILE
-- and EMAIL contacts, patient-a2 has no contacts, and patient-b lives in Org B.
-- Fixture inserts run as the owner; every RPC call runs as postgres with the
-- request.jwt.claim.sub GUC driving auth.uid().
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('e1010000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-a@p1802.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1010000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','reception-a@p1802.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1010000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000000','authenticated','authenticated','billing-a@p1802.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('e1010000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000000','authenticated','authenticated','dentist-b@p1802.example.test','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());
insert into public.organizations (id, legal_name, business_name, slug) values
  ('e1020000-0000-0000-0000-000000000001','P1802 Synthetic A Inc.','P1802 A','p1802-a'),
  ('e1020000-0000-0000-0000-000000000002','P1802 Synthetic B Inc.','P1802 B','p1802-b');
insert into public.branches (id, organization_id, name, slug, code, address_line1, city, province) values
  ('e1030000-0000-0000-0000-000000000001','e1020000-0000-0000-0000-000000000001','P1802 A Main','p1802-a-main','P1802-A','1 Synthetic St','Test City','Test Province'),
  ('e1030000-0000-0000-0000-000000000002','e1020000-0000-0000-0000-000000000001','P1802 A Branch 2','p1802-a-2','P1802-A2','2 Synthetic St','Test City','Test Province'),
  ('e1030000-0000-0000-0000-000000000003','e1020000-0000-0000-0000-000000000002','P1802 B Main','p1802-b-main','P1802-B','3 Synthetic St','Test City','Test Province');
insert into public.organization_members (id, organization_id, user_id, membership_status, joined_at) values
  ('e1040000-0000-0000-0000-000000000001','e1020000-0000-0000-0000-000000000001','e1010000-0000-0000-0000-000000000001','active',statement_timestamp()),
  ('e1040000-0000-0000-0000-000000000002','e1020000-0000-0000-0000-000000000001','e1010000-0000-0000-0000-000000000002','active',statement_timestamp()),
  ('e1040000-0000-0000-0000-000000000003','e1020000-0000-0000-0000-000000000001','e1010000-0000-0000-0000-000000000003','active',statement_timestamp()),
  ('e1040000-0000-0000-0000-000000000004','e1020000-0000-0000-0000-000000000002','e1010000-0000-0000-0000-000000000004','active',statement_timestamp());
insert into public.branch_memberships (organization_id, branch_id, organization_member_id, access_status) values
  ('e1020000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000001','e1040000-0000-0000-0000-000000000001','active'),
  ('e1020000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000001','e1040000-0000-0000-0000-000000000002','active'),
  ('e1020000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000001','e1040000-0000-0000-0000-000000000003','active'),
  ('e1020000-0000-0000-0000-000000000002','e1030000-0000-0000-0000-000000000003','e1040000-0000-0000-0000-000000000004','active');
insert into public.member_roles (organization_id, organization_member_id, role_id, branch_id, assigned_by)
select assignment.organization_id, assignment.organization_member_id, role.id, assignment.branch_id, assignment.user_id
from (values
  ('e1020000-0000-0000-0000-000000000001'::uuid,'e1040000-0000-0000-0000-000000000001'::uuid,'DENTIST'::text,null::uuid,'e1010000-0000-0000-0000-000000000001'::uuid),
  ('e1020000-0000-0000-0000-000000000001'::uuid,'e1040000-0000-0000-0000-000000000002'::uuid,'RECEPTIONIST'::text,'e1030000-0000-0000-0000-000000000001'::uuid,'e1010000-0000-0000-0000-000000000001'::uuid),
  ('e1020000-0000-0000-0000-000000000001'::uuid,'e1040000-0000-0000-0000-000000000003'::uuid,'BILLING'::text,'e1030000-0000-0000-0000-000000000001'::uuid,'e1010000-0000-0000-0000-000000000001'::uuid),
  ('e1020000-0000-0000-0000-000000000002'::uuid,'e1040000-0000-0000-0000-000000000004'::uuid,'DENTIST'::text,null::uuid,'e1010000-0000-0000-0000-000000000004'::uuid)
) as assignment(organization_id, organization_member_id, role_code, branch_id, user_id)
join public.roles as role on role.organization_id is null and role.code = assignment.role_code;
insert into public.patients (id, organization_id, patient_number, first_name, last_name, birth_date, preferred_branch_id) values
  ('e1050000-0000-0000-0000-000000000001','e1020000-0000-0000-0000-000000000001','P1802-A-1','Patient','A',date '1990-01-01','e1030000-0000-0000-0000-000000000001'),
  ('e1050000-0000-0000-0000-000000000002','e1020000-0000-0000-0000-000000000001','P1802-A-2','Patient','Two',date '1991-01-01','e1030000-0000-0000-0000-000000000001'),
  ('e1050000-0000-0000-0000-000000000003','e1020000-0000-0000-0000-000000000002','P1802-B-1','Patient','B',date '1992-01-01',null);
insert into public.patient_contacts (id, organization_id, patient_id, contact_type, value, is_primary, status) values
  ('e1060000-0000-0000-0000-000000000001','e1020000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001','MOBILE','+639171234567',true,'active'),
  ('e1060000-0000-0000-0000-000000000002','e1020000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001','EMAIL','patient.a@example.test',true,'active');
insert into public.providers (id, organization_id, first_name, last_name, provider_type, status) values
  ('e1070000-0000-0000-0000-000000000001','e1020000-0000-0000-0000-000000000001','Dentist','A1','REGULAR','active');
insert into public.provider_branches (organization_id, provider_id, branch_id, is_active) values
  ('e1020000-0000-0000-0000-000000000001','e1070000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000001',true);
insert into public.appointments (id, organization_id, branch_id, patient_id, starts_at, ends_at, scheduling_status, created_by) values
  ('e1080000-0000-0000-0000-000000000001','e1020000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001','2026-01-05 09:00:00+00','2026-01-05 09:30:00+00','SCHEDULED','e1010000-0000-0000-0000-000000000001'),
  ('e1080000-0000-0000-0000-000000000002','e1020000-0000-0000-0000-000000000002','e1030000-0000-0000-0000-000000000003','e1050000-0000-0000-0000-000000000003','2026-01-05 10:00:00+00','2026-01-05 10:30:00+00','SCHEDULED','e1010000-0000-0000-0000-000000000004');
insert into public.recall_rules (id, organization_id, branch_id, name, interval_months, channel) values
  ('e1090000-0000-0000-0000-000000000001','e1020000-0000-0000-0000-000000000002',null,'Foreign Rule','6','EMAIL');

create temp table r1802_rules (seq integer primary key, id uuid);
create temp table r1802_recalls (seq integer primary key, id uuid);
create temp table r1802_trigger_recalls (seq integer primary key, id uuid);
grant select on r1802_rules to authenticated;
grant select on r1802_recalls to authenticated;
grant select on r1802_trigger_recalls to authenticated;

-- Grant surface and definer hygiene.
select extensions.is((select count(*)::integer from pg_proc where oid in (
  'public.create_recall_rule(uuid,text,integer,text,uuid)'::regprocedure,
  'public.update_recall_rule(uuid,uuid,integer,text,integer,text,boolean)'::regprocedure,
  'public.list_recall_rules(uuid,boolean)'::regprocedure,
  'public.create_recall(uuid,uuid,uuid,timestamptz)'::regprocedure,
  'public.set_recall_opt_out(uuid,uuid,boolean)'::regprocedure,
  'public.complete_recall(uuid,uuid,integer)'::regprocedure,
  'public.cancel_recall(uuid,uuid,integer)'::regprocedure,
  'public.link_recall_appointment(uuid,uuid,integer,uuid)'::regprocedure,
  'public.enqueue_recall_reminder(uuid,uuid,integer)'::regprocedure,
  'public.list_recalls(uuid,uuid,text)'::regprocedure,
  'public.get_recall_retention_summary(uuid)'::regprocedure,
  'public.mark_recall_opted_out(uuid,uuid,integer)'::regprocedure,
  'private.has_recall_permission_at_branch(uuid,text)'::regprocedure,
  'private.recall_after_encounter_finalize()'::regprocedure
) and prosecdef and proconfig = array['search_path=""']::text[]),14,'the fourteen P18-02 definers pin an empty search path');
select extensions.ok(
  has_function_privilege('authenticated','public.create_recall_rule(uuid,text,integer,text,uuid)','execute')
  and has_function_privilege('authenticated','public.update_recall_rule(uuid,uuid,integer,text,integer,text,boolean)','execute')
  and has_function_privilege('authenticated','public.list_recall_rules(uuid,boolean)','execute')
  and has_function_privilege('authenticated','public.create_recall(uuid,uuid,uuid,timestamptz)','execute')
  and has_function_privilege('authenticated','public.set_recall_opt_out(uuid,uuid,boolean)','execute')
  and has_function_privilege('authenticated','public.complete_recall(uuid,uuid,integer)','execute')
  and has_function_privilege('authenticated','public.cancel_recall(uuid,uuid,integer)','execute')
  and has_function_privilege('authenticated','public.link_recall_appointment(uuid,uuid,integer,uuid)','execute')
  and has_function_privilege('authenticated','public.enqueue_recall_reminder(uuid,uuid,integer)','execute')
  and has_function_privilege('authenticated','public.list_recalls(uuid,uuid,text)','execute')
  and has_function_privilege('authenticated','public.get_recall_retention_summary(uuid)','execute')
  and has_function_privilege('authenticated','public.mark_recall_opted_out(uuid,uuid,integer)','execute')
  and not has_function_privilege('anon','public.create_recall_rule(uuid,text,integer,text,uuid)','execute')
  and not has_function_privilege('service_role','public.create_recall_rule(uuid,text,integer,text,uuid)','execute'),
  'only authenticated has the twelve exact P18-02 RPC grants'
);
select extensions.ok(not exists(
  select 1
  from (values
    ('private.has_recall_permission_at_branch(uuid,text)'),
    ('private.recall_after_encounter_finalize()')
  ) as object(signature)
  cross join (values('public'),('anon'),('authenticated'),('service_role')) as role(rolename)
  where has_function_privilege(role.rolename, object.signature, 'execute')
),'the private recall permission helper and the automation trigger are not executable by browser or service roles');

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','e1010000-0000-0000-0000-000000000001',true);

-- Rule lifecycle: clinic-wide + branch-scoped config, list scope, versioned update.
insert into r1802_rules (seq, id)
select 1, rule_id from public.create_recall_rule('e1030000-0000-0000-0000-000000000001','Six Month Recall',6,'EMAIL',null);
insert into r1802_rules (seq, id)
select 2, rule_id from public.create_recall_rule('e1030000-0000-0000-0000-000000000001','Main Branch Recall',12,'SMS','e1030000-0000-0000-0000-000000000001');
insert into r1802_rules (seq, id)
select 3, rule_id from public.create_recall_rule('e1030000-0000-0000-0000-000000000001','Inactive Rule',3,'NONE',null);
insert into r1802_rules (seq, id)
select 4, rule_id from public.create_recall_rule('e1030000-0000-0000-0000-000000000001','Branch Two Recall',6,'EMAIL','e1030000-0000-0000-0000-000000000002');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.rule.created'),4,'each rule create writes exactly one recall.rule.created audit event');
select extensions.is((select count(*)::integer from public.list_recall_rules('e1030000-0000-0000-0000-000000000001',false)),3,'list at A Main returns clinic-wide plus acting-branch rules only');
select extensions.ok(not exists (select 1 from public.list_recall_rules('e1030000-0000-0000-0000-000000000001',false) as listed where listed.rule_id=(select id from r1802_rules where seq=4)),'list at A Main never returns another branch rule');
select extensions.is((select count(*)::integer from public.list_recall_rules('e1030000-0000-0000-0000-000000000002',false)),3,'list at A Branch 2 returns its own branch-scoped rule plus clinic-wide rules');
select extensions.is((select version from public.update_recall_rule('e1030000-0000-0000-0000-000000000001',(select id from r1802_rules where seq=2),1,'Main Branch Recall','6','EMAIL',true)),2,'a recall rule updates with an optimistic version bump');
select extensions.throws_ok($$select public.update_recall_rule('e1030000-0000-0000-0000-000000000001',(select id from r1802_rules where seq=2),1,'Main Branch Recall','6','EMAIL',true)$$,'P0001','stale version','a stale expected version is rejected');
select extensions.is((select version from public.update_recall_rule('e1030000-0000-0000-0000-000000000001',(select id from r1802_rules where seq=3),1,'Inactive Rule','3','NONE',false)),2,'a rule can be deactivated with a version bump');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.rule.updated'),2,'each rule update writes exactly one recall.rule.updated audit event');
select extensions.throws_ok($$select public.create_recall_rule('e1030000-0000-0000-0000-000000000001','Zero Interval',0,'EMAIL',null)$$,'22023','invalid input','an interval below one month is rejected by the RPC');
select extensions.throws_ok($$select public.create_recall_rule('e1030000-0000-0000-0000-000000000001','Long Interval',121,'EMAIL',null)$$,'22023','invalid input','an interval above 120 months is rejected by the RPC');
select extensions.throws_ok($$select public.create_recall_rule('e1030000-0000-0000-0000-000000000001',repeat('n',161),6,'EMAIL',null)$$,'22023','invalid input','an oversized rule name is rejected by the RPC');
select extensions.throws_ok($$select public.create_recall_rule('e1030000-0000-0000-0000-000000000001','Bad Channel',6,'FAX',null)$$,'22023','invalid input','an invented channel is rejected by the RPC');
select extensions.throws_ok($$select public.create_recall_rule('e1030000-0000-0000-0000-000000000001','Foreign Branch',6,'EMAIL','e1030000-0000-0000-0000-000000000003')$$,'42501','not authorized','a rule cannot be scoped to a foreign-organization branch');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.rule.created'),4,'rejected rule creates write no audit event');

-- create_recall: computed due date, explicit due date, org-scoped patient and rule.
insert into r1802_recalls (seq, id)
select 1, recall_id from public.create_recall('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001',(select id from r1802_rules where seq=1),null);
insert into r1802_recalls (seq, id)
select 2, recall_id from public.create_recall('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001',(select id from r1802_rules where seq=1),statement_timestamp() - interval '1 month');
insert into r1802_recalls (seq, id)
select 3, recall_id from public.create_recall('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001',(select id from r1802_rules where seq=1),null);
insert into r1802_recalls (seq, id)
select 4, recall_id from public.create_recall('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001',(select id from r1802_rules where seq=1),null);
insert into r1802_recalls (seq, id)
select 5, recall_id from public.create_recall('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001',(select id from r1802_rules where seq=1),null);
insert into r1802_recalls (seq, id)
select 6, recall_id from public.create_recall('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001',(select id from r1802_rules where seq=3),null);
insert into r1802_recalls (seq, id)
select 7, recall_id from public.create_recall('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000002',(select id from r1802_rules where seq=1),null);
select extensions.ok((select due_date > now() + interval '6 months' - interval '1 minute' and due_date < now() + interval '6 months' + interval '1 minute' from public.recalls where id=(select id from r1802_recalls where seq=1)),'create computes due_date = now + interval_months when omitted');
select extensions.ok((select due_date > now() - interval '1 month' - interval '1 minute' and due_date < now() - interval '1 month' + interval '1 minute' from public.recalls where id=(select id from r1802_recalls where seq=2)),'create honors an explicit due_date');
select extensions.is((select status='SCHEDULED' and version=1 and created_by='e1010000-0000-0000-0000-000000000001' from public.recalls where id=(select id from r1802_recalls where seq=1)),true,'create derives the actor and starts SCHEDULED at version one');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.created'),7,'each manual recall create writes exactly one patient-linked recall.created audit event');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.created' and patient_id='e1050000-0000-0000-0000-000000000002'),1,'the no-contact patient recall is audited against its own patient');
select extensions.throws_ok($$select public.create_recall('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000003',(select id from r1802_rules where seq=1),null)$$,'42501','not authorized','a foreign-organization patient is denied');
select extensions.throws_ok($$select public.create_recall('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001','e1090000-0000-0000-0000-000000000001',null)$$,'42501','not authorized','a foreign-organization rule is denied');

-- Completed treatment creates recall: finalizing a clinical encounter fires the
-- automation trigger for each active matching rule (clinic-wide or the
-- encounter's branch); the inactive rule is skipped.
insert into public.clinical_encounters (id, organization_id, branch_id, patient_id, appointment_id, treating_provider_id, status, created_by) values
  ('e1100000-0000-0000-0000-000000000001','e1020000-0000-0000-0000-000000000001','e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001','e1080000-0000-0000-0000-000000000001','e1070000-0000-0000-0000-000000000001','OPEN','e1010000-0000-0000-0000-000000000001');
select extensions.lives_ok($$update public.clinical_encounters set status='FINALIZED', finalized_at=statement_timestamp(), version=2 where id='e1100000-0000-0000-0000-000000000001'$$,'a completed treatment finalizes its clinical encounter');
insert into r1802_trigger_recalls (seq, id)
select row_number() over (order by recall.recall_rule_id), recall.id
from public.recalls as recall
where recall.organization_id='e1020000-0000-0000-0000-000000000001' and recall.created_by is null;
select extensions.is((select count(*)::integer from r1802_trigger_recalls),2,'finalizing the encounter auto-creates recalls for the clinic-wide and the acting-branch active rules');
select extensions.is((select count(*)::integer from public.recalls where id in (select id from r1802_trigger_recalls) and recall_rule_id=(select id from r1802_rules where seq=1) and due_date > now() + interval '6 months' - interval '1 minute' and due_date < now() + interval '6 months' + interval '1 minute'),1,'the clinic-wide rule recall is SCHEDULED at now + 6 months');
select extensions.is((select count(*)::integer from public.recalls where id in (select id from r1802_trigger_recalls) and recall_rule_id=(select id from r1802_rules where seq=2) and due_date > now() + interval '6 months' - interval '1 minute' and due_date < now() + interval '6 months' + interval '1 minute'),1,'the branch-scoped rule recall uses the rule interval updated before finalization');
select extensions.ok(not exists (select 1 from public.recalls where id in (select id from r1802_trigger_recalls) and recall_rule_id=(select id from r1802_rules where seq=3)),'the deactivated rule is not auto-created');
select extensions.lives_ok($$update public.clinical_encounters set version=3 where id='e1100000-0000-0000-0000-000000000001'$$,'re-touching a FINALIZED encounter does not re-fire the trigger');
select extensions.is((select count(*)::integer from public.recalls where id in (select id from r1802_trigger_recalls)),2,'re-finalizing an already FINALIZED encounter creates no additional recalls');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.created'),7,'the automation trigger creates recalls without writing recall.created audit events');

-- list_recalls: overdue is derived, filters are optional, projections are bounded.
select extensions.is((select count(*)::integer from public.list_recalls('e1030000-0000-0000-0000-000000000001',null,null)),9,'list returns every recall for the acting branch');
select extensions.is((select status from public.list_recalls('e1030000-0000-0000-0000-000000000001',null,null) where recall_id=(select id from r1802_recalls where seq=2)),'OVERDUE','a SCHEDULED recall with a past due_date is reported OVERDUE in the projection');
select extensions.is((select count(*)::integer from public.list_recalls('e1030000-0000-0000-0000-000000000001',null,'OVERDUE')),1,'the OVERDUE filter selects exactly the derived overdue rows');
select extensions.is((select count(*)::integer from public.list_recalls('e1030000-0000-0000-0000-000000000001',null,'SCHEDULED')),8,'the SCHEDULED filter excludes the derived overdue rows');
select extensions.is((select count(*)::integer from public.list_recalls('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001',null)),8,'the patient filter narrows to that patient');
select extensions.is((select count(*)::integer from public.list_recalls('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000002',null)),1,'the patient filter resolves the no-contact patient recall');
select extensions.is((select patient_display_name from public.list_recalls('e1030000-0000-0000-0000-000000000001',null,null) where recall_id=(select id from r1802_recalls where seq=1)),'Patient A','list projects the patient display name without exposing contacts');
select extensions.throws_ok($$select public.list_recalls('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000003',null)$$,'42501','not authorized','a foreign-organization patient filter is denied');
select extensions.throws_ok($$select public.list_recalls('e1030000-0000-0000-0000-000000000001',null,'LOST')$$,'22023','invalid input','an unknown status filter is rejected');

-- enqueue_recall_reminder: positive enqueue, then opt-out, OPTED_OUT, NONE
-- channel, and no-contact skips (none of which increment or enqueue).
select extensions.is((select status || ':' || version from public.enqueue_recall_reminder('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=4),1)),'SCHEDULED:2','enqueueing a reminder returns the unchanged status with a version bump');
select extensions.is((select count(*)::integer from public.communications where organization_id='e1020000-0000-0000-0000-000000000001' and template_type='REMINDER' and appointment_id is null),1,'the positive enqueue creates exactly one REMINDER communication');
select extensions.is((select channel || ':' || recipient from public.communications where idempotency_key='recall-reminder-' || (select id::text from r1802_recalls where seq=4) || '-1'),'SMS:+639171234567','the reminder targets the normalized primary mobile via SMS');
select extensions.is((select status from public.communications where idempotency_key='recall-reminder-' || (select id::text from r1802_recalls where seq=4) || '-1'),'QUEUED','the enqueued reminder starts QUEUED for the Phase 8 worker');
select extensions.ok((select reminder_sent_at is not null and reminders_sent=1 and version=2 from public.recalls where id=(select id from r1802_recalls where seq=4)),'the positive enqueue stamps reminder_sent_at and bumps reminders_sent');
select extensions.is((select version from public.enqueue_recall_reminder('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=4),2)),3,'a second enqueue bumps the version again');
select extensions.ok((select reminders_sent=2 from public.recalls where id=(select id from r1802_recalls where seq=4)),'the second enqueue increments reminders_sent again');
select extensions.is((select count(*)::integer from public.communications where idempotency_key='recall-reminder-' || (select id::text from r1802_recalls where seq=4) || '-2'),1,'each enqueue version carries its own idempotency key');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.reminder_enqueued' and patient_id='e1050000-0000-0000-0000-000000000001'),2,'each successful enqueue writes exactly one recall.reminder_enqueued audit event');

select extensions.is((select recall_opt_out from public.set_recall_opt_out('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001',true)),true,'the opt-out preference upserts to opted out');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.preferences.updated'),1,'the opt-out update writes exactly one recall.preferences.updated audit event');
select extensions.is((select version from public.enqueue_recall_reminder('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=4),3)),3,'an opted-out patient skips the enqueue without a version bump');
select extensions.ok((select reminders_sent=2 and reminder_sent_at is not null from public.recalls where id=(select id from r1802_recalls where seq=4)),'the opt-out skip does not increment reminders_sent');
select extensions.is((select count(*)::integer from public.communications where idempotency_key='recall-reminder-' || (select id::text from r1802_recalls where seq=4) || '-3'),0,'the opt-out skip enqueues nothing');
select extensions.is((select recall_opt_out from public.set_recall_opt_out('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001',false)),false,'the opt-out preference can be re-enabled');
select extensions.throws_ok($$select public.set_recall_opt_out('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000003',true)$$,'42501','not authorized','a foreign-organization patient cannot get a preference');

select extensions.is((select status from public.mark_recall_opted_out('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=5),1)),'OPTED_OUT','an individual recall can be marked OPTED_OUT');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.opted_out' and patient_id='e1050000-0000-0000-0000-000000000001'),1,'marking opted out writes exactly one recall.opted_out audit event');
select extensions.is((select status || ':' || version from public.enqueue_recall_reminder('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=5),2)),'OPTED_OUT:2','an OPTED_OUT recall skips the enqueue without any change');
select extensions.is((select count(*)::integer from public.communications where organization_id='e1020000-0000-0000-0000-000000000001' and idempotency_key like 'recall-reminder-' || (select id::text from r1802_recalls where seq=5) || '-%'),0,'the OPTED_OUT skip enqueues nothing');
select extensions.is((select status || ':' || version from public.enqueue_recall_reminder('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=6),1)),'SCHEDULED:1','a NONE-channel rule skips the enqueue without any change');
select extensions.is((select count(*)::integer from public.communications where idempotency_key like 'recall-reminder-' || (select id::text from r1802_recalls where seq=6) || '-%'),0,'the NONE-channel rule enqueues nothing');
select extensions.is((select status || ':' || version from public.enqueue_recall_reminder('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=7),1)),'SCHEDULED:1','a patient without a contact skips the enqueue without any change');
select extensions.is((select count(*)::integer from public.communications where idempotency_key like 'recall-reminder-' || (select id::text from r1802_recalls where seq=7) || '-%'),0,'the no-contact skip enqueues nothing');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.reminder_enqueued'),2,'the skip paths write no audit events');

-- Booked recall links correctly: appointment is org-scoped, status unchanged.
select extensions.is((select appointment_id from public.link_recall_appointment('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=2),1,'e1080000-0000-0000-0000-000000000001')),'e1080000-0000-0000-0000-000000000001','a same-tenant appointment links to the recall');
select extensions.ok((select status='SCHEDULED' and version=2 and appointment_id='e1080000-0000-0000-0000-000000000001' from public.recalls where id=(select id from r1802_recalls where seq=2)),'linking an appointment leaves the recall status unchanged with a version bump');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.appointment_linked' and patient_id='e1050000-0000-0000-0000-000000000001'),1,'linking writes exactly one recall.appointment_linked audit event');
select extensions.throws_ok($$select public.link_recall_appointment('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=1),1,'e1080000-0000-0000-0000-000000000002')$$,'42501','not authorized','a foreign-organization appointment cannot be linked');
select extensions.throws_ok($$select public.link_recall_appointment('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=1),9,'e1080000-0000-0000-0000-000000000001')$$,'P0001','stale version','linking with a stale version is rejected');

-- Complete/cancel transitions are versioned and forward-only.
select extensions.is((select status from public.complete_recall('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=3),1)),'COMPLETED','a SCHEDULED recall completes');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.completed' and patient_id='e1050000-0000-0000-0000-000000000001'),1,'completing writes exactly one recall.completed audit event');
select extensions.throws_ok($$select public.complete_recall('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=3),2)$$,'P0001','invalid state','an already-completed recall rejects further completion');
select extensions.is((select status from public.cancel_recall('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=1),1)),'CANCELLED','a SCHEDULED recall cancels');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.cancelled' and patient_id='e1050000-0000-0000-0000-000000000001'),1,'cancelling writes exactly one recall.cancelled audit event');
select extensions.throws_ok($$select public.cancel_recall('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=3),2)$$,'P0001','invalid state','a completed recall cannot be cancelled');
select extensions.throws_ok($$select public.complete_recall('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=6),2)$$,'P0001','stale version','a stale version is rejected before any status change');
select extensions.throws_ok($$select public.enqueue_recall_reminder('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=3),(select version from public.recalls where id=(select id from r1802_recalls where seq=3)))$$,'P0001','invalid state','a completed recall cannot enqueue a reminder');

-- Retention summary aggregates by rule name and stored status, no patient rows.
select extensions.set_eq(
  $$select recall_rule_name || ':' || status || ':' || recall_count::text from public.get_recall_retention_summary('e1030000-0000-0000-0000-000000000001')$$,
  array[
    'Inactive Rule:SCHEDULED:1',
    'Main Branch Recall:SCHEDULED:1',
    'Six Month Recall:CANCELLED:1',
    'Six Month Recall:COMPLETED:1',
    'Six Month Recall:OPTED_OUT:1',
    'Six Month Recall:SCHEDULED:4'
  ]::text[],
  'the retention summary groups aggregate counts by rule name and status'
);
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.completed'),1,'the summary writes no audit events');

-- Exactly-one-audit-per-mutation summary.
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.rule.created'),4,'exactly four rule.created audits');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.rule.updated'),2,'exactly two rule.updated audits');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.created'),7,'exactly seven recall.created audits');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.preferences.updated'),2,'exactly two preferences.updated audits');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.reminder_enqueued'),2,'exactly two reminder_enqueued audits');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.opted_out'),1,'exactly one opted_out audit');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.appointment_linked'),1,'exactly one appointment_linked audit');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.completed'),1,'exactly one completed audit');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.cancelled'),1,'exactly one cancelled audit');

-- Audit-rollback: a blocked audit rolls back the mutation and its enqueue.
insert into r1802_recalls (seq, id)
select 8, recall_id from public.create_recall('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001',(select id from r1802_rules where seq=1),null);
create function private.r1802_block_recall_audit() returns trigger language plpgsql as $$begin if new.action in ('recall.completed','recall.reminder_enqueued') then raise exception using errcode = 'P0001', message = 'audit blocked'; end if; return new; end;$$;
create trigger r1802_block_recall_audit before insert on public.audit_events for each row execute function private.r1802_block_recall_audit();
select extensions.throws_ok($$select public.complete_recall('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=6),1)$$,'P0001','audit blocked','a failing recall.completed audit event rejects the completion');
select extensions.throws_ok($$select public.enqueue_recall_reminder('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=8),1)$$,'P0001','audit blocked','a failing recall.reminder_enqueued audit event rejects the enqueue');
drop trigger r1802_block_recall_audit on public.audit_events;
drop function private.r1802_block_recall_audit();
select extensions.ok((select status='SCHEDULED' and version=1 from public.recalls where id=(select id from r1802_recalls where seq=6)),'a blocked audit rolls back the completion');
select extensions.ok((select status='SCHEDULED' and version=1 and reminders_sent=0 and reminder_sent_at is null from public.recalls where id=(select id from r1802_recalls where seq=8)),'a blocked audit rolls back the enqueue, its version bump, and its communication row');
select extensions.is((select count(*)::integer from public.communications where idempotency_key like 'recall-reminder-' || (select id::text from r1802_recalls where seq=8) || '-%'),0,'a blocked enqueue leaves no communication row behind');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.reminder_enqueued'),2,'a blocked audit rolls back its own audit row');
select extensions.is((select count(*)::integer from public.audit_events where organization_id='e1020000-0000-0000-0000-000000000001' and action='recall.completed'),1,'a blocked completion rolls back its own audit row');

-- Permission denials: reception reads only, billing nothing, foreign denied.
select set_config('request.jwt.claim.sub','e1010000-0000-0000-0000-000000000002',true);
select extensions.is((select count(*)::integer from public.list_recalls('e1030000-0000-0000-0000-000000000001',null,null)),10,'a receptionist with recall.read can list recalls');
select extensions.is((select count(*)::integer from public.get_recall_retention_summary('e1030000-0000-0000-0000-000000000001')),6,'a receptionist with recall.read can read the retention summary');
select extensions.throws_ok($$select public.create_recall_rule('e1030000-0000-0000-0000-000000000001','Denied',6,'EMAIL',null)$$,'42501','not authorized','a receptionist without recall.manage cannot create rules');
select extensions.throws_ok($$select public.list_recall_rules('e1030000-0000-0000-0000-000000000001',false)$$,'42501','not authorized','rule listing is manage-gated so a receptionist is denied');
select extensions.throws_ok($$select public.create_recall('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001',(select id from r1802_rules where seq=1),null)$$,'42501','not authorized','a receptionist without recall.manage cannot create recalls');
select extensions.throws_ok($$select public.complete_recall('e1030000-0000-0000-0000-000000000001',(select id from r1802_recalls where seq=1),(select version from public.recalls where id=(select id from r1802_recalls where seq=1)))$$,'42501','not authorized','a receptionist without recall.manage cannot complete recalls');
select set_config('request.jwt.claim.sub','e1010000-0000-0000-0000-000000000003',true);
select extensions.throws_ok($$select public.list_recalls('e1030000-0000-0000-0000-000000000001',null,null)$$,'42501','not authorized','a billing user without recall.read cannot list recalls');
select extensions.throws_ok($$select public.get_recall_retention_summary('e1030000-0000-0000-0000-000000000001')$$,'42501','not authorized','a billing user cannot read the retention summary');
select extensions.throws_ok($$select public.create_recall('e1030000-0000-0000-0000-000000000001','e1050000-0000-0000-0000-000000000001',(select id from r1802_rules where seq=1),null)$$,'42501','not authorized','a billing user without recall.manage cannot create recalls');
select set_config('request.jwt.claim.sub','e1010000-0000-0000-0000-000000000004',true);
select extensions.throws_ok($$select public.create_recall_rule('e1030000-0000-0000-0000-000000000001','Foreign Actor',6,'EMAIL',null)$$,'42501','not authorized','a foreign-organization dentist cannot manage Org A rules');
select extensions.throws_ok($$select public.list_recalls('e1030000-0000-0000-0000-000000000001',null,null)$$,'42501','not authorized','a foreign-organization dentist cannot read Org A recalls');

with test_failures as (select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$')
select case when count(*)=0 then 'P1_TEST_PASS' else string_agg(finish,E'\n') end as p1_test_result from test_failures;

rollback;