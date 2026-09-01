-- Approved-grant registry integrity, task 9 review round 5.
--
-- scripts/approved-final-grants.mjs is the security ledger: it records every
-- privilege the browser is approved to hold, and the migration privilege lint
-- enforces that the terminal migrations grant exactly that set. Its own
-- assertSupersedeReferencesResolve() checks that markers which EXIST point at
-- real files and real objects - but it never asks whether an entry carrying NO
-- marker still refers to a function that exists.
--
-- That gap is not hypothetical. Task 9 review round 4 found THREE entries naming
-- functions dropped more than a hundred migrations earlier:
--
--   public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text)
--   public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text)
--   public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,uuid,bigint,date)
--
-- On the registry's own account each remained an approved `authenticated`
-- privilege. Nothing in the gate would have caught a fourth.
--
-- This suite closes that. The property, not a snapshot:
--
--   every registered function grant must resolve to a live object, OR carry a
--   supersede marker explaining why it does not.
--
-- The list below is exactly the registry's UNMARKED function grants, so a
-- deliberately retired entry stays legal by carrying its marker and dropping out
-- of this list. scripts/boundary-privilege-invariant.test.mjs asserts that this
-- list still equals the registry, so the two cannot drift; that guard runs in
-- `npx vitest run scripts/`, which needs no database.
--
-- Placed early in DATABASE_TEST_SUITES on purpose. The local gate halts at
-- supabase/tests/treatment_plans.test.sql, and every *.local.mjs test runs only
-- after the whole pgTAP loop, so anything registered there would never execute.
-- This suite runs long before the halt, in both the local and the remote runner.

begin;

select extensions.no_plan();

create temporary table approved_grant_objects (signature text primary key) on commit drop;

insert into approved_grant_objects (signature) values
  ('private.has_booking_review_permission_at_branch(uuid,text)'),
  ('private.has_branch_access(uuid)'),
  ('private.has_branch_permission(uuid, text)'),
  ('private.has_org_permission(uuid, text)'),
  ('private.has_shared_patient_permission(uuid, text)'),
  ('private.is_active_org_member(uuid)'),
  ('private.is_own_organization_member(uuid)'),
  ('public.accept_workforce_invitation(uuid, text, text)'),
  ('public.acknowledge_calendar_sync(uuid,uuid,text)'),
  ('public.acknowledge_communication(uuid,uuid,text)'),
  ('public.acknowledge_treatment_plan(uuid,uuid,integer)'),
  ('public.add_treatment_plan_alternative(uuid,uuid,integer,text)'),
  ('public.add_treatment_plan_discussion_v2(uuid,uuid,text,text)'),
  ('public.add_treatment_plan_item(uuid,uuid,integer,uuid,text,text,numeric)'),
  ('public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint)'),
  ('public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text)'),
  ('public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text,boolean,boolean,boolean,boolean)'),
  ('public.adjust_stock(uuid,uuid,integer,integer,text)'),
  ('public.allocate_payment(uuid,uuid,uuid,uuid,bigint,text)'),
  ('public.amend_clinical_note(uuid,uuid,integer,text)'),
  ('public.amend_current_bridge(uuid,uuid,integer,jsonb)'),
  ('public.amend_current_implant_component(uuid,uuid,integer,jsonb)'),
  ('public.amend_procedure_installment_schedule(uuid,uuid,text,jsonb,text,text)'),
  ('public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text)'),
  ('public.approve_charge_direct_cost(uuid,uuid,text,bigint,text,text)'),
  ('public.archive_branch(uuid)'),
  ('public.archive_clinical_photo(uuid,uuid,uuid,integer,text)'),
  ('public.archive_file(uuid,uuid,integer)'),
  ('public.archive_patient(uuid, uuid, integer)'),
  ('public.archive_patient_contact(uuid,uuid,uuid,integer)'),
  ('public.archive_patient_relationship(uuid,uuid,uuid,integer)'),
  ('public.archive_procedure(uuid, uuid, integer)'),
  ('public.archive_provider(uuid, uuid, integer)'),
  ('public.cancel_appointment(uuid,uuid,integer,text)'),
  ('public.cancel_communication(uuid,uuid,integer)'),
  ('public.cancel_inventory_transfer(uuid,uuid,integer,text)'),
  ('public.cancel_recall(uuid,uuid,integer)'),
  ('public.cancel_specialist_request(uuid,uuid,integer,text)'),
  ('public.claim_clinical_photo_processing(uuid,uuid)'),
  ('public.claim_due_calendar_syncs(uuid,integer)'),
  ('public.claim_due_communications(uuid,integer)'),
  ('public.clear_postdated_cheque(uuid,uuid,text)'),
  ('public.complete_clinical_photo_derivatives(uuid,uuid,uuid,text,bigint,jsonb)'),
  ('public.complete_recall(uuid,uuid,integer)'),
  ('public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text)'),
  ('public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text)'),
  ('public.confirm_clinical_photo_source_upload(uuid,uuid,uuid,integer,bigint)'),
  ('public.confirm_file_upload(uuid,uuid,integer,bigint)'),
  ('public.confirm_transfer_receipt(uuid,uuid,integer)'),
  ('public.connect_calendar(uuid,uuid,text,text)'),
  ('public.correct_charge_attribution(uuid,uuid,uuid,date,text,text)'),
  ('public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)'),
  ('public.create_appointment(uuid,uuid,jsonb)'),
  ('public.create_branch(uuid, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, boolean)'),
  ('public.create_clinical_note(uuid,uuid,text,text)'),
  ('public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text)'),
  ('public.create_clinical_photo_source_upload(uuid,uuid,text,bigint)'),
  ('public.create_file_upload(uuid,uuid,text,bigint)'),
  ('public.create_intake_form(uuid,uuid,text,uuid)'),
  ('public.create_inventory_item(uuid,text,text,text,text,integer,boolean)'),
  ('public.create_inventory_transfer(uuid,uuid,uuid,uuid,integer,text)'),
  ('public.create_patient(uuid, text, text, text, text, text, date, text, text, text, text, text, text, uuid, text, text, boolean)'),
  ('public.create_patient(uuid,text,text,text,text,text,date,text,text,text,text,text,text,uuid,text,text,boolean,jsonb)'),
  ('public.create_patient_contact(uuid,uuid,text,text,text,boolean,boolean)'),
  ('public.create_patient_medical_record(uuid,uuid,text,jsonb)'),
  ('public.create_patient_referral(uuid,uuid,jsonb)'),
  ('public.create_patient_relationship(uuid,uuid,uuid,text,text,text,text,boolean,boolean,boolean)'),
  ('public.create_periodontal_examination(uuid,uuid,uuid,text)'),
  ('public.create_plan_bridge_design(uuid,uuid,uuid,jsonb)'),
  ('public.create_plan_implant_design(uuid,uuid,uuid,jsonb)'),
  ('public.create_prescription(uuid,uuid,jsonb)'),
  ('public.create_procedure(uuid, jsonb)'),
  ('public.create_procedure_direct_cost_default(uuid,uuid,text,text,bigint)'),
  ('public.create_procedure_installment_schedule(uuid,uuid,jsonb,text)'),
  ('public.create_provider(uuid, jsonb)'),
  ('public.create_recall(uuid,uuid,uuid,timestamptz)'),
  ('public.create_recall_rule(uuid,text,integer,text,uuid)'),
  ('public.create_specialist_request(uuid,uuid,jsonb)'),
  ('public.create_specialty(uuid, text, text)'),
  ('public.create_treatment_plan(uuid,uuid,text)'),
  ('public.create_treatment_plan_v2(uuid,uuid,text,uuid,text)'),
  ('public.create_walkin_entry(uuid,uuid,text,uuid,uuid)'),
  ('public.deactivate_procedure_direct_cost_default(uuid,uuid,integer)'),
  ('public.disconnect_calendar(uuid,uuid)'),
  ('public.enqueue_calendar_sync(uuid,uuid,uuid,text)'),
  ('public.enqueue_communication(uuid,uuid,text,text,text,text,text,timestamptz)'),
  ('public.enqueue_recall_reminder(uuid,uuid,integer)'),
  ('public.fail_calendar_sync(uuid,uuid,text)'),
  ('public.fail_clinical_photo_processing(uuid,uuid)'),
  ('public.fail_communication(uuid,uuid)'),
  ('public.fail_workforce_invitation(uuid)'),
  ('public.finalize_clinical_encounter(uuid,uuid,integer)'),
  ('public.finalize_clinical_note(uuid,uuid,integer)'),
  ('public.finalize_periodontal_examination(uuid,uuid,integer)'),
  ('public.finalize_prescription(uuid,uuid,integer)'),
  ('public.finalize_workforce_invitation(uuid, uuid, uuid)'),
  ('public.find_available_slots(uuid,uuid,timestamptz,timestamptz,integer,integer)'),
  ('public.find_duplicate_candidates(uuid, text, text, date, text, text)'),
  ('public.generate_document(uuid,uuid,text,jsonb)'),
  ('public.get_acquisition_summary(uuid,integer)'),
  ('public.get_clinical_composer_context(uuid,uuid)'),
  ('public.get_clinical_encounter_detail(uuid,uuid)'),
  ('public.get_clinical_photo_derivative(uuid,uuid,uuid,text)'),
  ('public.get_clinical_photo_source_upload(uuid,uuid,uuid)'),
  ('public.get_current_managed_visit(uuid,uuid)'),
  ('public.get_document_snapshot(uuid,uuid)'),
  ('public.get_file_metadata(uuid,uuid)'),
  ('public.get_financial_summary(uuid,uuid,date,date)'),
  ('public.get_inventory_aggregate(uuid)'),
  ('public.get_operational_analytics_summary(uuid,uuid,integer)'),
  ('public.get_patient_detail(uuid, uuid)'),
  ('public.get_patient_detail(uuid,uuid)'),
  ('public.get_patient_odontogram(uuid,uuid)'),
  ('public.get_patient_odontogram_v3(uuid,uuid)'),
  ('public.get_procedure_configuration(uuid, uuid)'),
  ('public.get_provider_configuration(uuid, uuid)'),
  ('public.get_public_site(text)'),
  ('public.get_public_site_settings(uuid)'),
  ('public.get_recall_retention_summary(uuid)'),
  ('public.get_treatment_plan_completion_context(uuid,uuid)'),
  ('public.get_treatment_plan_detail(uuid,uuid)'),
  ('public.get_workforce_invitation_summary(uuid)'),
  ('public.issue_stock(uuid,uuid,integer,integer,text)'),
  ('public.link_recall_appointment(uuid,uuid,integer,uuid)'),
  ('public.list_acquisition_sources(uuid)'),
  ('public.list_appointments(uuid,timestamptz,timestamptz,uuid,text)'),
  ('public.list_availability(uuid,uuid,date,date)'),
  ('public.list_booking_channels(uuid)'),
  ('public.list_booking_requests(uuid,text)'),
  ('public.list_calendar_integrations(uuid)'),
  ('public.list_calendar_syncs(uuid,uuid)'),
  ('public.list_clinical_encounters(uuid,uuid)'),
  ('public.list_clinical_photos(uuid,uuid)'),
  ('public.list_communications(uuid,uuid,text)'),
  ('public.list_consent_templates(uuid)'),
  ('public.list_documents(uuid,uuid,text)'),
  ('public.list_intake_forms(uuid,uuid)'),
  ('public.list_inventory_items(uuid,boolean)'),
  ('public.list_inventory_movements(uuid,uuid)'),
  ('public.list_inventory_stock(uuid,uuid,boolean)'),
  ('public.list_inventory_transfers(uuid,text)'),
  ('public.list_operational_analytics_breakdown(uuid,uuid,integer)'),
  ('public.list_patient_account(uuid,uuid)'),
  ('public.list_patient_files(uuid,uuid,boolean)'),
  ('public.list_patient_medical_records(uuid,uuid,text)'),
  ('public.list_patient_referrals(uuid,uuid,boolean)'),
  ('public.list_payment_methods(uuid)'),
  ('public.list_pending_pdc(uuid,uuid)'),
  ('public.list_procedure_direct_cost_defaults(uuid,uuid,boolean)'),
  ('public.list_procedures(uuid)'),
  ('public.list_provider_directory(uuid)'),
  ('public.list_provider_earnings(uuid,uuid,date,date)'),
  ('public.list_queue(uuid,boolean)'),
  ('public.list_recall_rules(uuid,boolean)'),
  ('public.list_recalls(uuid,uuid,text)'),
  ('public.list_specialist_requests(uuid,text)'),
  ('public.list_specialties(uuid)'),
  ('public.list_treatment_plans(uuid,uuid)'),
  ('public.list_unresolved_charge_compensation(uuid,uuid)'),
  ('public.list_workforce_invitation_options(uuid)'),
  ('public.mark_intake_form_paper(uuid,uuid,integer,text)'),
  ('public.mark_recall_opted_out(uuid,uuid,integer)'),
  ('public.pair_clinical_photos(uuid,uuid,uuid)'),
  ('public.post_charge(uuid,uuid,uuid,uuid,bigint,uuid,boolean,text,text)'),
  ('public.post_charge_adjustment(uuid,uuid,text,bigint,text,text)'),
  ('public.post_charge_with_attribution_override(uuid,uuid,uuid,date,uuid,uuid,bigint,uuid,boolean,text,text,text)'),
  ('public.prepare_first_owner_invitation(uuid, uuid, text)'),
  ('public.prepare_workforce_invitation(uuid, uuid, uuid, text, uuid, uuid)'),
  ('public.present_treatment_plan(uuid,uuid,integer)'),
  ('public.public_cancel_booking_request(uuid,text)'),
  ('public.public_get_available_slots(text,text,integer)'),
  ('public.public_get_booking_status(uuid,text)'),
  ('public.public_get_intake_form(text,text)'),
  ('public.public_submit_booking_request(text,jsonb)'),
  ('public.public_submit_intake_form(text,text,jsonb,boolean)'),
  ('public.reactivate_patient(uuid, uuid, integer)'),
  ('public.receive_stock(uuid,uuid,integer,text,date)'),
  ('public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,text)'),
  ('public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,text)'),
  ('public.record_direct_treatment_with_charge(uuid,uuid,uuid,bigint,jsonb,text)'),
  ('public.record_mfa_enrollment(uuid)'),
  ('public.record_payment(uuid,uuid,uuid,bigint,text,text)'),
  ('public.record_postdated_cheque(uuid,uuid,text,text,bigint,date,jsonb,text)'),
  ('public.record_procedure_followup(uuid,uuid,text,timestamptz,text)'),
  ('public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text)'),
  ('public.record_treatment_event_v2(uuid,uuid,uuid,uuid,uuid,integer,text,date,uuid[],jsonb,bigint,jsonb,jsonb,uuid)'),
  ('public.record_visit_bridge_v2(uuid,uuid,jsonb,date,uuid,text,text)'),
  ('public.record_visit_clinical_note(uuid,uuid,text,text,uuid)'),
  ('public.record_visit_implant_component_v2(uuid,uuid,jsonb,date,uuid,text,text)'),
  ('public.record_visit_tooth_findings(uuid,uuid,text[],text,text[],text,date,text,uuid)'),
  ('public.refund_payment(uuid,uuid,uuid,bigint,text,jsonb,text)'),
  ('public.remove_treatment_plan_item(uuid,uuid,uuid,integer)'),
  ('public.rename_clinical_photo(uuid,uuid,integer,text)'),
  ('public.requeue_communication(uuid,uuid,integer)'),
  ('public.reschedule_appointment(uuid,uuid,integer,timestamptz,timestamptz)'),
  ('public.resolve_charge_compensation(uuid,uuid,text,text)'),
  ('public.resolve_legacy_odontogram_entry(uuid,uuid,text,uuid,uuid,uuid,text)'),
  ('public.resolve_odontogram_entity_patient(uuid,text,uuid)'),
  ('public.respond_specialist_request(uuid,uuid,integer,jsonb)'),
  ('public.reverse_charge_adjustment(uuid,uuid,text,text)'),
  ('public.reverse_charge_direct_cost(uuid,uuid,text,text)'),
  ('public.reverse_payment_allocation(uuid,uuid,bigint,text,text)'),
  ('public.review_booking_request(uuid,uuid,integer,text,text)'),
  ('public.revoke_workforce_invitation(uuid, uuid)'),
  ('public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)'),
  ('public.save_treatment_plan_drawing(uuid,uuid,integer,jsonb)'),
  ('public.search_patients(uuid, text, date, text, text, integer, integer)'),
  ('public.set_branch_membership(uuid, uuid, text)'),
  ('public.set_member_role(uuid, uuid, uuid, boolean)'),
  ('public.set_procedure_default_fee(uuid,uuid,integer,bigint)'),
  ('public.set_procedure_eligible_providers(uuid, uuid, integer, uuid[])'),
  ('public.set_procedure_specialties(uuid, uuid, integer, jsonb)'),
  ('public.set_provider_branches(uuid, uuid, integer, uuid[])'),
  ('public.set_provider_compensation_agreement(uuid,uuid,date,date,integer,text,text)'),
  ('public.set_provider_specialties(uuid, uuid, integer, jsonb)'),
  ('public.set_recall_opt_out(uuid,uuid,boolean)'),
  ('public.set_role_permission(uuid, text, boolean)'),
  ('public.summarize_procedure_charges(uuid,uuid,uuid)'),
  ('public.transition_postdated_cheque(uuid,uuid,text,text,text)'),
  ('public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)'),
  ('public.update_appointment_status(uuid,uuid,integer,text,text,text)'),
  ('public.update_branch(uuid, text, text, text, text, text, text, text, text, text, boolean)'),
  ('public.update_clinical_note(uuid,uuid,integer,text)'),
  ('public.update_draft_plan_bridge_design(uuid,uuid,integer,jsonb)'),
  ('public.update_draft_plan_implant_design(uuid,uuid,integer,jsonb)'),
  ('public.update_inventory_item(uuid,uuid,integer,text,text,text,integer,boolean,boolean)'),
  ('public.update_organization_member_status(uuid, text)'),
  ('public.update_patient(uuid, uuid, integer, jsonb, boolean)'),
  ('public.update_patient_attribution(uuid,uuid,integer,jsonb)'),
  ('public.update_patient_contact(uuid,uuid,uuid,integer,text,text,text,boolean,boolean)'),
  ('public.update_patient_referral_status(uuid,uuid,integer,text)'),
  ('public.update_patient_relationship(uuid,uuid,uuid,integer,uuid,text,text,text,text,boolean,boolean,boolean)'),
  ('public.update_procedure(uuid, uuid, integer, jsonb)'),
  ('public.update_procedure_direct_cost_default(uuid,uuid,integer,text,text,bigint)'),
  ('public.update_provider(uuid, uuid, integer, jsonb)'),
  ('public.update_public_site_settings(uuid,integer,jsonb)'),
  ('public.update_queue_status(uuid,uuid,integer,text,text)'),
  ('public.update_recall_rule(uuid,uuid,integer,text,integer,text,boolean)'),
  ('public.update_specialty(uuid, uuid, integer, jsonb)'),
  ('public.update_treatment_plan(uuid,uuid,integer,text)'),
  ('public.update_treatment_plan_item(uuid,uuid,uuid,integer,uuid,text,text,numeric)'),
  ('public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint)'),
  ('public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text)'),
  ('public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text,boolean,boolean,boolean,boolean)'),
  ('public.upsert_payment_method(uuid,text,text,boolean,uuid,integer,text)'),
  ('public.void_charge(uuid,uuid,text,text)'),
  ('public.void_current_bridge(uuid,uuid,integer,text)'),
  ('public.void_current_implant_component(uuid,uuid,integer,text)'),
  ('public.void_patient_medical_record(uuid,uuid,integer)'),
  ('public.void_payment(uuid,uuid,text,text)'),
  ('public.void_tooth_clinical_entry(uuid,uuid,integer,text)');

select extensions.is(
  (select pg_catalog.count(*)::integer from approved_grant_objects),
  251,
  'the approved-grant registry projection carries every unmarked function grant'
);

-- Named, not counted: the failure message lists the offending signatures so the
-- next person gets the work item rather than a number.
select extensions.is(
  (select coalesce(
     pg_catalog.string_agg(candidate.signature, E'
' order by candidate.signature), '')
   from approved_grant_objects as candidate
   where pg_catalog.to_regprocedure(candidate.signature) is null),
  '',
  'every approved grant without a supersede marker resolves to a live function'
);

with test_failures as (
  select finish from extensions.finish() where finish !~ '^1\.\.[0-9]+$'
)
select case when count(*) = 0 then 'P1_TEST_PASS' else string_agg(finish, E'
') end as p1_test_result
from test_failures;

rollback;
