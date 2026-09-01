import { describe, expect, it } from "vitest";

import { TERMINAL_MIGRATIONS, assertSupersedeReferencesResolve } from "./approved-final-grants.mjs";
import {
  ACCEPTED_BOUNDARY_EXCEPTIONS,
  assertBaselineObservesPrivileges,
  assertExaminedGrowth,
  assertFinalBoundary,
  assertPreFinalBoundary,
  assertPreFinalStatementBoundary,
  assertSnapshotUsable,
  browserReachableApprovedKeys,
  diffAgainstBaseline,
  foldPrivilegeRows,
} from "./boundary-privilege-invariant.mjs";
import { splitSqlStatements } from "./migration-privilege-lint.mjs";
import * as boundaryRunner from "./run-boundary-privilege-invariant.mjs";
import {
  assertOverrideTargetsLinkedProject,
  assertR6dExecutionIsApproved,
  assertStatementModeFile,
  R6D_BOUNDARY_TEST_CONFIRMATION,
  resolveMode,
  resolveQueryArgs,
} from "./run-boundary-privilege-invariant.mjs";

/**
 * Synthetic snapshots. R6-D has run in both modes against disposable TEST
 * projects (see docs/AI_HANDOFF.md). These exercise the decision logic that
 * judges the real snapshots independently of the hosted evidence.
 */
function snapshot({ privileges = [], examined = {}, ...rest } = {}) {
  return {
    examined: {
      schemas: 6,
      browser_roles: 2,
      tables: 11,
      columns: 120,
      sequences: 0,
      functions: 27,
      security_definer_functions: 21,
      extension_owned_objects: 400,
      ...examined,
    },
    public_tables_without_rls: [],
    security_definer_functions: [],
    privileges,
    ...rest,
  };
}

const PLATFORM_BASELINE = snapshot({
  examined: { tables: 0, columns: 0, functions: 0, security_definer_functions: 0 },
  privileges: [
    { grantee: "anon", object_class: "schema", object: "public", privilege: "usage", column: null },
    {
      grantee: "authenticated",
      object_class: "schema",
      object: "public",
      privilege: "usage",
      column: null,
    },
    { grantee: "public", object_class: "schema", object: "public", privilege: "usage", column: null },
  ],
});

const APPROVED_FINAL_PRIVILEGES = [
  ...PLATFORM_BASELINE.privileges,
  ...[
    "public.organizations",
    "public.branches",
    "public.profiles",
    "public.organization_members",
    "public.roles",
    "public.permissions",
    "public.role_permissions",
    "public.branch_memberships",
    "public.member_roles",
    "public.audit_events",
  ].map((object) => ({
    grantee: "authenticated",
    object_class: "table",
    object,
    privilege: "select",
    column: null,
  })),
  ...["display_name", "first_name", "last_name", "mobile", "avatar_object_key"].map(
    (column) => ({
      grantee: "authenticated",
      object_class: "column",
      object: "public.profiles",
      privilege: "update",
      column,
    }),
  ),
  ...[
    "private.is_active_org_member(uuid)",
    "private.has_org_permission(uuid, text)",
    "private.has_branch_access(uuid)",
    "private.has_branch_permission(uuid, text)",
    "private.is_own_organization_member(uuid)",
    "private.has_shared_patient_permission(uuid, text)",
    "public.find_duplicate_candidates(uuid, text, text, date, text, text)",
    "public.create_patient(uuid, text, text, text, text, text, date, text, text, text, text, text, text, uuid, text, text, boolean)",
    "public.create_patient(uuid, text, text, text, text, text, date, text, text, text, text, text, text, uuid, text, text, boolean, jsonb)",
    "public.search_patients(uuid, text, date, text, text, integer, integer)",
    "public.get_patient_detail(uuid, uuid)",
    "public.update_patient(uuid, uuid, integer, jsonb, boolean)",
    "public.update_patient_attribution(uuid, uuid, integer, jsonb)",
    "public.create_patient_referral(uuid, uuid, jsonb)",
    "public.update_patient_referral_status(uuid, uuid, integer, text)",
    "public.list_patient_referrals(uuid, uuid, boolean)",
    "public.list_acquisition_sources(uuid)",
    "public.list_booking_channels(uuid)",
    "public.get_acquisition_summary(uuid, integer)",
    "public.create_patient_contact(uuid, uuid, text, text, text, boolean, boolean)",
    "public.update_patient_contact(uuid, uuid, uuid, integer, text, text, text, boolean, boolean)",
    "public.archive_patient_contact(uuid, uuid, uuid, integer)",
    "public.create_patient_relationship(uuid, uuid, uuid, text, text, text, text, boolean, boolean, boolean)",
    "public.update_patient_relationship(uuid, uuid, uuid, integer, uuid, text, text, text, text, boolean, boolean, boolean)",
    "public.archive_patient_relationship(uuid, uuid, uuid, integer)",
    "public.archive_patient(uuid, uuid, integer)",
    "public.reactivate_patient(uuid, uuid, integer)",
    "public.create_branch(uuid, text, text, text, text, text, text, text, text, text, text, text, text, numeric, numeric, boolean)",
    "public.set_role_permission(uuid, text, boolean)",
    "public.set_member_role(uuid, uuid, uuid, boolean)",
    "public.set_branch_membership(uuid, uuid, text)",
    "public.update_organization_member_status(uuid, text)",
    "public.record_mfa_enrollment(uuid)",
    "public.update_branch(uuid, text, text, text, text, text, text, text, text, text, boolean)",
    "public.archive_branch(uuid)",
    "public.create_provider(uuid, jsonb)",
    "public.update_provider(uuid, uuid, integer, jsonb)",
    "public.archive_provider(uuid, uuid, integer)",
    "public.create_specialty(uuid, text, text)",
    "public.update_specialty(uuid, uuid, integer, jsonb)",
    "public.set_provider_branches(uuid, uuid, integer, uuid[])",
    "public.set_provider_specialties(uuid, uuid, integer, jsonb)",
    "public.list_provider_directory(uuid)",
    "public.get_provider_configuration(uuid, uuid)",
    "public.list_specialties(uuid)",
    "public.create_procedure(uuid, jsonb)",
    "public.update_procedure(uuid, uuid, integer, jsonb)",
    "public.archive_procedure(uuid, uuid, integer)",
    "public.set_procedure_specialties(uuid, uuid, integer, jsonb)",
    "public.set_procedure_eligible_providers(uuid, uuid, integer, uuid[])",
    "public.list_procedures(uuid)",
    "public.get_procedure_configuration(uuid, uuid)",
    "public.create_file_upload(uuid, uuid, text, bigint)",
    "public.confirm_file_upload(uuid, uuid, integer, bigint)",
    "public.list_patient_files(uuid, uuid, boolean)",
    "public.get_file_metadata(uuid, uuid)",
    "public.archive_file(uuid, uuid, integer)",
    "public.create_appointment(uuid, uuid, jsonb)",
    "public.reschedule_appointment(uuid, uuid, integer, timestamptz, timestamptz)",
    "public.cancel_appointment(uuid, uuid, integer, text)",
    "public.update_appointment_status(uuid, uuid, integer, text, text, text)",
    "public.list_appointments(uuid, timestamptz, timestamptz, uuid, text)",
    "public.list_availability(uuid, uuid, date, date)",
    "public.find_available_slots(uuid, uuid, timestamptz, timestamptz, integer, integer)",
    "public.create_walkin_entry(uuid, uuid, text, uuid, uuid)",
    "public.update_queue_status(uuid, uuid, integer, text, text)",
    "public.list_queue(uuid, boolean)",
    "public.enqueue_communication(uuid, uuid, text, text, text, text, text, timestamptz)",
    "public.cancel_communication(uuid, uuid, integer)",
    "public.list_communications(uuid, uuid, text)",
    "public.acknowledge_communication(uuid, uuid, text)",
    "public.fail_communication(uuid, uuid)",
    "public.claim_due_communications(uuid, integer)",
    "public.requeue_communication(uuid, uuid, integer)",
    "public.enqueue_calendar_sync(uuid, uuid, uuid, text)",
    "public.list_calendar_syncs(uuid, uuid)",
    "public.claim_due_calendar_syncs(uuid, integer)",
    "public.acknowledge_calendar_sync(uuid, uuid, text)",
    "public.fail_calendar_sync(uuid, uuid, text)",
    "public.connect_calendar(uuid, uuid, text, text)",
    "public.disconnect_calendar(uuid, uuid)",
    "public.list_calendar_integrations(uuid)",
    "public.create_specialist_request(uuid, uuid, jsonb)",
    "public.respond_specialist_request(uuid, uuid, integer, jsonb)",
    "public.cancel_specialist_request(uuid, uuid, integer, text)",
    "public.list_specialist_requests(uuid, text)",
"public.generate_document(uuid, uuid, text, jsonb)",
    "public.list_documents(uuid, uuid, text)",
    "public.get_document_snapshot(uuid, uuid)",
    "public.get_public_site(text)",
    "public.get_public_site_settings(uuid)",
    "public.update_public_site_settings(uuid, integer, jsonb)",
    "public.public_get_available_slots(text, text, integer)",
    "public.public_submit_booking_request(text, jsonb)",
    "public.public_get_booking_status(uuid, text)",
    "public.public_cancel_booking_request(uuid, text)",
    "private.has_booking_review_permission_at_branch(uuid, text)",
    "public.list_booking_requests(uuid, text)",
    "public.review_booking_request(uuid, uuid, integer, text, text)",
    "public.start_or_resume_clinical_visit(uuid, uuid, uuid, uuid)",
    "public.get_current_managed_visit(uuid, uuid)",
    "public.create_clinical_note(uuid, uuid, text, text)",
    "public.update_clinical_note(uuid, uuid, integer, text)",
    "public.finalize_clinical_note(uuid, uuid, integer)",
    "public.amend_clinical_note(uuid, uuid, integer, text)",
    "public.finalize_clinical_encounter(uuid, uuid, integer)",
    "public.create_patient_medical_record(uuid, uuid, text, jsonb)",
    "public.void_patient_medical_record(uuid, uuid, integer)",
    "public.list_clinical_encounters(uuid, uuid)",
    "public.get_clinical_encounter_detail(uuid, uuid)",
    "public.list_patient_medical_records(uuid, uuid, text)",
    "public.create_prescription(uuid, uuid, jsonb)",
    "public.finalize_prescription(uuid, uuid, integer)",
    "public.get_patient_odontogram(uuid,uuid)",
    "public.get_patient_odontogram_v3(uuid,uuid)",
    "public.record_tooth_clinical_entry(uuid,uuid,text,text[],text,text,text,jsonb,text,timestamptz,text)",
    // `record_tooth_clinical_entry_v3` is deliberately absent: the visit-bound
    // composer superseded it and its browser grant was revoked adjacent to the
    // composer's creation.
    "public.record_visit_tooth_findings(uuid,uuid,text[],text,text[],text,date,text,uuid)",
    "public.record_visit_clinical_note(uuid,uuid,text,text,uuid)",
    "public.amend_tooth_clinical_entry(uuid,uuid,integer,text,text[],text)",
    "public.void_tooth_clinical_entry(uuid,uuid,integer,text)",
    "public.create_plan_bridge_design(uuid,uuid,uuid,jsonb)",
    "public.update_draft_plan_bridge_design(uuid,uuid,integer,jsonb)",
    "public.record_current_bridge(uuid,uuid,jsonb,uuid,timestamptz,uuid)",
    "public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,text)",
    "public.record_current_bridge_v3(uuid,uuid,jsonb,timestamptz,uuid,text)",
    "public.amend_current_bridge(uuid,uuid,integer,jsonb)",
    "public.void_current_bridge(uuid,uuid,integer,text)",
    "public.create_plan_implant_design(uuid,uuid,uuid,jsonb)",
    "public.update_draft_plan_implant_design(uuid,uuid,integer,jsonb)",
    "public.record_current_implant_component(uuid,uuid,jsonb,uuid,timestamptz,uuid)",
    "public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,text)",
    "public.record_current_implant_component_v3(uuid,uuid,jsonb,timestamptz,uuid,text)",
    "public.amend_current_implant_component(uuid,uuid,integer,jsonb)",
    "public.void_current_implant_component(uuid,uuid,integer,text)",
    "public.create_periodontal_examination(uuid,uuid,uuid,text)",
    "public.save_periodontal_measurements(uuid,uuid,jsonb,jsonb,jsonb,jsonb)",
    "public.finalize_periodontal_examination(uuid,uuid,integer)",
    "public.amend_periodontal_examination(uuid,uuid,uuid)",
    "public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text)",
    "public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,uuid,bigint,date)",
    "public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text)",
    "public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint)",
    "public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint)",
    "public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text)",
    "public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text)",
    "public.add_treatment_plan_item_centavos(uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text,boolean,boolean,boolean,boolean)",
    "public.update_treatment_plan_item_centavos(uuid,uuid,uuid,integer,uuid,text,text,bigint,text,integer,text[],text,boolean,boolean,boolean,boolean)",
    "public.resolve_legacy_odontogram_entry(uuid,uuid,text,uuid,uuid,uuid,text)",
    "public.transition_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)",
    "public.complete_treatment_plan_item_with_charge(uuid,uuid,integer,bigint,text,jsonb,text)",
    "public.correct_treatment_plan_item_execution(uuid,uuid,integer,text,text,text)",
    "public.resolve_odontogram_entity_patient(uuid,text,uuid)",
    "public.create_treatment_plan(uuid, uuid, text)",
    "public.update_treatment_plan(uuid, uuid, integer, text)",
    "public.present_treatment_plan(uuid, uuid, integer)",
    "public.acknowledge_treatment_plan(uuid, uuid, integer)",
    "public.add_treatment_plan_item(uuid, uuid, integer, uuid, text, text, numeric)",
    "public.update_treatment_plan_item(uuid, uuid, uuid, integer, uuid, text, text, numeric)",
    "public.remove_treatment_plan_item(uuid, uuid, uuid, integer)",
    "public.add_treatment_plan_alternative(uuid, uuid, integer, text)",
    "public.add_treatment_plan_discussion(uuid, uuid, uuid, text, text)",
    "public.save_treatment_plan_drawing(uuid, uuid, integer, jsonb)",
    "public.list_treatment_plans(uuid, uuid)",
    "public.get_treatment_plan_detail(uuid, uuid)",
    "public.record_direct_treatment_with_charge(uuid,uuid,uuid,bigint,jsonb,text)",
    "public.record_procedure_followup(uuid,uuid,text,timestamptz,text)",
    "public.create_procedure_installment_schedule(uuid,uuid,jsonb,text)",
    "public.amend_procedure_installment_schedule(uuid,uuid,text,jsonb,text,text)",
    "public.complete_treatment_case(uuid,uuid,uuid,integer,uuid[],bigint,jsonb,text)",
    "public.get_treatment_plan_completion_context(uuid,uuid)",
    "public.create_clinical_photo(uuid,uuid,uuid,uuid,text,text,text,timestamptz,text[],text[],text)",
    "public.list_clinical_photos(uuid,uuid)",
    "public.rename_clinical_photo(uuid,uuid,integer,text)",
    "public.pair_clinical_photos(uuid,uuid,uuid)",
    "public.claim_clinical_photo_processing(uuid,uuid)",
    "public.fail_clinical_photo_processing(uuid,uuid)",
    "public.create_clinical_photo_source_upload(uuid,uuid,text,bigint)",
    "public.get_clinical_photo_source_upload(uuid,uuid,uuid)",
    "public.confirm_clinical_photo_source_upload(uuid,uuid,uuid,integer,bigint)",
    "public.get_clinical_photo_derivative(uuid,uuid,uuid,text)",
    "public.archive_clinical_photo(uuid,uuid,uuid,integer,text)",
    "public.create_intake_form(uuid, uuid, text, uuid)",
    "public.public_get_intake_form(text, text)",
    "public.public_submit_intake_form(text, text, jsonb, boolean)",
    "public.mark_intake_form_paper(uuid, uuid, integer, text)",
    "public.list_intake_forms(uuid, uuid)",
    "public.list_consent_templates(uuid)",
    "public.create_recall_rule(uuid, text, integer, text, uuid)",
    "public.update_recall_rule(uuid, uuid, integer, text, integer, text, boolean)",
    "public.list_recall_rules(uuid, boolean)",
    "public.create_recall(uuid, uuid, uuid, timestamptz)",
    "public.set_recall_opt_out(uuid, uuid, boolean)",
    "public.complete_recall(uuid, uuid, integer)",
    "public.cancel_recall(uuid, uuid, integer)",
    "public.link_recall_appointment(uuid, uuid, integer, uuid)",
    "public.enqueue_recall_reminder(uuid, uuid, integer)",
    "public.list_recalls(uuid, uuid, text)",
    "public.get_recall_retention_summary(uuid)",
    "public.mark_recall_opted_out(uuid, uuid, integer)",
    "public.create_inventory_item(uuid, text, text, text, text, integer, boolean)",
    "public.update_inventory_item(uuid, uuid, integer, text, text, text, integer, boolean, boolean)",
    "public.list_inventory_items(uuid, boolean)",
    "public.receive_stock(uuid, uuid, integer, text, date)",
    "public.adjust_stock(uuid, uuid, integer, integer, text)",
    "public.issue_stock(uuid, uuid, integer, integer, text)",
    "public.create_inventory_transfer(uuid, uuid, uuid, uuid, integer, text)",
    "public.confirm_transfer_receipt(uuid, uuid, integer)",
    "public.cancel_inventory_transfer(uuid, uuid, integer, text)",
    "public.list_inventory_stock(uuid, uuid, boolean)",
    "public.list_inventory_movements(uuid, uuid)",
    "public.get_inventory_aggregate(uuid)",
    "public.list_inventory_transfers(uuid, text)",
    "public.get_operational_analytics_summary(uuid, uuid, integer)",
    "public.list_operational_analytics_breakdown(uuid, uuid, integer)",
    "public.list_patient_account(uuid, uuid)",
    "public.post_charge(uuid, uuid, uuid, uuid, bigint, uuid, boolean, text, text)",
    "public.post_charge_with_attribution_override(uuid, uuid, uuid, date, uuid, uuid, bigint, uuid, boolean, text, text, text)",
    "public.correct_charge_attribution(uuid, uuid, uuid, date, text, text)",
    "public.void_charge(uuid, uuid, text, text)",
    "public.approve_charge_direct_cost(uuid, uuid, text, bigint, text, text)",
    "public.reverse_charge_direct_cost(uuid, uuid, text, text)",
    "public.post_charge_adjustment(uuid, uuid, text, bigint, text, text)",
    "public.reverse_charge_adjustment(uuid, uuid, text, text)",
    "public.record_payment(uuid, uuid, uuid, bigint, text, text)",
    "public.void_payment(uuid, uuid, text, text)",
    "public.allocate_payment(uuid, uuid, uuid, uuid, bigint, text)",
    "public.reverse_payment_allocation(uuid, uuid, bigint, text, text)",
    "public.refund_payment(uuid, uuid, uuid, bigint, text, jsonb, text)",
    "public.record_postdated_cheque(uuid, uuid, text, text, bigint, date, jsonb, text)",
    "public.transition_postdated_cheque(uuid, uuid, text, text, text)",
    "public.clear_postdated_cheque(uuid, uuid, text)",
    "public.list_payment_methods(uuid)",
    "public.upsert_payment_method(uuid, text, text, boolean, uuid, integer, text)",
    "public.set_provider_compensation_agreement(uuid, uuid, date, date, integer, text, text)",
    "public.list_unresolved_charge_compensation(uuid, uuid)",
    "public.resolve_charge_compensation(uuid, uuid, text, text)",
    "public.list_provider_earnings(uuid, uuid, date, date)",
    "public.set_procedure_default_fee(uuid, uuid, integer, bigint)",
    "public.list_procedure_direct_cost_defaults(uuid, uuid, boolean)",
    "public.create_procedure_direct_cost_default(uuid, uuid, text, text, bigint)",
    "public.update_procedure_direct_cost_default(uuid, uuid, integer, text, text, bigint)",
    "public.deactivate_procedure_direct_cost_default(uuid, uuid, integer)",
    "public.summarize_procedure_charges(uuid, uuid, uuid)",
    "public.get_financial_summary(uuid, uuid, date, date)",
    "public.list_pending_pdc(uuid, uuid)",
  ].map((object) => ({
    grantee: "authenticated",
    object_class: "function",
    object,
    privilege: "execute",
    column: null,
  })),
  {
    grantee: "anon",
    object_class: "function",
    object: "public.get_public_site(text)",
    privilege: "execute",
    column: null,
  },
  {
    grantee: "anon",
    object_class: "function",
    object: "public.public_get_available_slots(text, text, integer)",
    privilege: "execute",
    column: null,
  },
  {
    grantee: "anon",
    object_class: "function",
    object: "public.public_submit_booking_request(text, jsonb)",
    privilege: "execute",
    column: null,
  },
  {
    grantee: "anon",
    object_class: "function",
    object: "public.public_get_booking_status(uuid, text)",
    privilege: "execute",
    column: null,
  },
  {
    grantee: "anon",
    object_class: "function",
    object: "public.public_cancel_booking_request(uuid, text)",
    privilege: "execute",
    column: null,
  },
  {
    grantee: "anon",
    object_class: "function",
    object: "public.public_get_intake_form(text, text)",
    privilege: "execute",
    column: null,
  },
  {
    grantee: "anon",
    object_class: "function",
    object: "public.public_submit_intake_form(text, text, jsonb, boolean)",
    privilege: "execute",
    column: null,
  },
];

describe("probe row folding", () => {
  it("folds column rows into one column-scoped table entry", () => {
    const folded = foldPrivilegeRows([
      {
        grantee: "authenticated",
        object_class: "column",
        object: "public.profiles",
        privilege: "update",
        column: "mobile",
      },
      {
        grantee: "authenticated",
        object_class: "column",
        object: "public.profiles",
        privilege: "update",
        column: "display_name",
      },
    ]);

    expect(folded).toEqual([
      {
        grantee: "authenticated",
        objectClass: "table",
        object: "public.profiles",
        privilege: "update",
        columns: ["display_name", "mobile"],
      },
    ]);
  });

  it("keeps different privileges on the same object separate", () => {
    expect(
      foldPrivilegeRows([
        {
          grantee: "authenticated",
          object_class: "column",
          object: "public.profiles",
          privilege: "update",
          column: "mobile",
        },
        {
          grantee: "authenticated",
          object_class: "column",
          object: "public.profiles",
          privilege: "insert",
          column: "mobile",
        },
      ]),
    ).toHaveLength(2);
  });
});

describe("snapshot usability", () => {
  it("refuses a snapshot taken while the browser-reachable roles were not visible", () => {
    const problems = assertSnapshotUsable(
      snapshot({ examined: { browser_roles: 0 } }),
      "boundary 3",
    );

    expect(problems.join("\n")).toContain("a pass would be meaningless");
  });

  it("refuses a snapshot that examined fewer objects than the migrations create", () => {
    const problems = assertSnapshotUsable(snapshot({ examined: { tables: 2 } }), "boundary 3", {
      tables: 11,
    });

    expect(problems.join("\n")).toContain("not seeing the objects it is meant to judge");
  });

  it("refuses a platform baseline in which the probe observed nothing at all", () => {
    expect(assertBaselineObservesPrivileges(snapshot({ privileges: [] }))).toHaveLength(1);
    expect(assertBaselineObservesPrivileges(PLATFORM_BASELINE)).toEqual([]);
  });

  it("refuses a missing or malformed snapshot instead of treating it as clean", () => {
    expect(assertSnapshotUsable(undefined, "boundary 3")).toHaveLength(1);
    expect(assertSnapshotUsable({}, "boundary 3").join("\n")).toContain(
      "records nothing about what it examined",
    );
  });

  it("refuses a probe whose view of the database shrank between boundaries", () => {
    const problems = assertExaminedGrowth(
      snapshot({ examined: { tables: 11 } }),
      snapshot({ examined: { tables: 4 } }),
      "boundary 5",
    );

    expect(problems.join("\n")).toContain("examined fewer tables");
  });
});

describe("pre-final boundaries", () => {
  it("passes when a boundary adds nothing beyond the platform baseline", () => {
    expect(
      assertPreFinalBoundary({
        label: "boundary 3",
        baselineSnapshot: PLATFORM_BASELINE,
        snapshot: snapshot({ privileges: PLATFORM_BASELINE.privileges }),
      }),
    ).toEqual([]);
  });

  it("fails when a browser-reachable role gains any table privilege early", () => {
    const problems = assertPreFinalBoundary({
      label: "boundary 3",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: [
          ...PLATFORM_BASELINE.privileges,
          {
            grantee: "authenticated",
            object_class: "table",
            object: "public.role_permissions",
            privilege: "insert",
            column: null,
          },
        ],
      }),
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("public.role_permissions");
    expect(problems[0]).toContain("insert");
  });

  it("fails when a new SECURITY DEFINER function is left executable by PUBLIC", () => {
    const problems = assertPreFinalBoundary({
      label: "boundary 7",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: [
          ...PLATFORM_BASELINE.privileges,
          {
            grantee: "public",
            object_class: "function",
            object: "public.set_role_permission(uuid, text, boolean)",
            privilege: "execute",
            column: null,
          },
        ],
      }),
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("set_role_permission");
  });

  it("fails when a Data API table has RLS disabled", () => {
    const problems = assertPreFinalBoundary({
      label: "boundary 2",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: PLATFORM_BASELINE.privileges,
        public_tables_without_rls: ["public.branches"],
      }),
    });

    expect(problems.join("\n")).toContain("row level security disabled");
  });

  it("fails when a SECURITY DEFINER function has no pinned search_path", () => {
    const problems = assertPreFinalBoundary({
      label: "boundary 6",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: PLATFORM_BASELINE.privileges,
        security_definer_functions: [
          { object: "private.has_org_permission(uuid, text)", configuration: "" },
        ],
      }),
    });

    expect(problems.join("\n")).toContain("no pinned search_path");
  });

  it("accepts only the documented extension-schema exception", () => {
    expect(ACCEPTED_BOUNDARY_EXCEPTIONS).toHaveLength(1);

    expect(
      assertPreFinalBoundary({
        label: "boundary 1",
        baselineSnapshot: PLATFORM_BASELINE,
        snapshot: snapshot({
          privileges: [
            ...PLATFORM_BASELINE.privileges,
            {
              grantee: "public",
              object_class: "function",
              object: "extensions.pgtap_version()",
              privilege: "execute",
              column: null,
            },
          ],
        }),
      }),
    ).toEqual([]);

    // The same shape in an application schema is NOT excused.
    expect(
      assertPreFinalBoundary({
        label: "boundary 1",
        baselineSnapshot: PLATFORM_BASELINE,
        snapshot: snapshot({
          privileges: [
            ...PLATFORM_BASELINE.privileges,
            {
              grantee: "public",
              object_class: "function",
              object: "public.pgtap_version()",
              privilege: "execute",
              column: null,
            },
          ],
        }),
      }),
    ).toHaveLength(1);
  });
});

describe("statement-mode grace window", () => {
  const NEW_FUNCTION_EXECUTE = {
    grantee: "public",
    object_class: "function",
    object: "public.set_role_permission(uuid, text, boolean)",
    privilege: "execute",
    column: null,
  };

  const CREATE_SET_ROLE_PERMISSION = {
    type: "create",
    objectClass: "function",
    identity: "public.set_role_permission(uuid, text, boolean)",
  };

  const NOT_A_CREATE = { type: "other" };

  const NEW_MEMBER_ROLE_EXECUTE = {
    grantee: "public",
    object_class: "function",
    object: "public.set_member_role(uuid, uuid, uuid, boolean)",
    privilege: "execute",
    column: null,
  };

  const CREATE_SET_MEMBER_ROLE = {
    type: "create",
    objectClass: "function",
    identity: "public.set_member_role(uuid, uuid, uuid, boolean)",
  };

  it("does not report PostgreSQL's own default PUBLIC EXECUTE the statement it first appears", () => {
    const result = assertPreFinalStatementBoundary({
      label: "boundary N (CREATE FUNCTION statement)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE] }),
      pending: [],
      statement: CREATE_SET_ROLE_PERMISSION,
    });

    expect(result.problems).toEqual([]);
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0].key).toContain("set_role_permission");
  });

  it("reports it as a real violation if it is still present the following statement", () => {
    const afterCreate = snapshot({
      privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE],
    });

    const first = assertPreFinalStatementBoundary({
      label: "boundary N (CREATE FUNCTION statement)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: afterCreate,
      pending: [],
      statement: CREATE_SET_ROLE_PERMISSION,
    });

    const second = assertPreFinalStatementBoundary({
      label: "boundary N+1 (still not revoked)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: afterCreate,
      snapshot: afterCreate,
      pending: first.pending,
      statement: NOT_A_CREATE,
    });

    expect(second.problems).toHaveLength(1);
    expect(second.problems[0]).toContain("set_role_permission");
    expect(second.problems[0]).toContain("adjacent");
  });

  it("reports nothing once the adjacent REVOKE closes it by the following statement", () => {
    const afterCreate = snapshot({
      privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE],
    });

    const first = assertPreFinalStatementBoundary({
      label: "boundary N (CREATE FUNCTION statement)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: afterCreate,
      pending: [],
      statement: CREATE_SET_ROLE_PERMISSION,
    });

    const second = assertPreFinalStatementBoundary({
      label: "boundary N+1 (REVOKE statement)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: afterCreate,
      snapshot: snapshot({ privileges: PLATFORM_BASELINE.privileges }),
      pending: first.pending,
      statement: NOT_A_CREATE,
    });

    expect(second.problems).toEqual([]);
    expect(second.pending).toEqual([]);
  });

  it("grants grace to all three probe-shaped rows the same PUBLIC EXECUTE default produces, and closes all three on the adjacent REVOKE", () => {
    // The live probe does not read ACL text — it asks has_function_privilege
    // per role. A single PostgreSQL PUBLIC EXECUTE default is therefore
    // observed as three effective-privilege rows, not one: PUBLIC's own,
    // and anon's/authenticated's derived-through-PUBLIC rows.
    const THREE_ROLE_ROWS = [
      { ...NEW_FUNCTION_EXECUTE, grantee: "public" },
      { ...NEW_FUNCTION_EXECUTE, grantee: "anon" },
      { ...NEW_FUNCTION_EXECUTE, grantee: "authenticated" },
    ];
    const afterCreate = snapshot({ privileges: [...PLATFORM_BASELINE.privileges, ...THREE_ROLE_ROWS] });

    const first = assertPreFinalStatementBoundary({
      label: "boundary N (CREATE FUNCTION statement, probe-shaped)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: afterCreate,
      pending: [],
      statement: CREATE_SET_ROLE_PERMISSION,
    });

    expect(first.problems).toEqual([]);
    expect(first.pending).toHaveLength(3);

    const second = assertPreFinalStatementBoundary({
      label: "boundary N+1 (adjacent REVOKE closes all three)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: afterCreate,
      snapshot: snapshot({ privileges: PLATFORM_BASELINE.privileges }),
      pending: first.pending,
      statement: NOT_A_CREATE,
    });

    expect(second.problems).toEqual([]);
    expect(second.pending).toEqual([]);
  });

  it("still fails immediately on an anon/authenticated grant that is not the statement's own default", () => {
    // Same grantees as the recognized default, but naming a different
    // function than the one this statement created — must not be graced.
    const UNRELATED_ROLE_EXECUTE = {
      grantee: "authenticated",
      object_class: "function",
      object: "public.set_member_role(uuid, uuid, uuid, boolean)",
      privilege: "execute",
      column: null,
    };

    const result = assertPreFinalStatementBoundary({
      label: "boundary N (unrelated function, probe-shaped)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, UNRELATED_ROLE_EXECUTE] }),
      pending: [],
      statement: CREATE_SET_ROLE_PERMISSION,
    });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("set_member_role");
    expect(result.pending).toEqual([]);
  });

  it("does not grace an anon/authenticated EXECUTE row unless the same statement's diff also holds the correlated PUBLIC EXECUTE row", () => {
    // Same grantee, privilege, and object as the recognized default, but the
    // PUBLIC row that would prove it came from PostgreSQL's own CREATE
    // FUNCTION default is absent — this could equally be a direct GRANT to
    // authenticated, so it must fail immediately, not get graced on shape
    // alone.
    const AUTHENTICATED_EXECUTE_WITHOUT_PUBLIC_SIBLING = {
      grantee: "authenticated",
      object_class: "function",
      object: "public.set_role_permission(uuid, text, boolean)",
      privilege: "execute",
      column: null,
    };

    const result = assertPreFinalStatementBoundary({
      label: "boundary N (authenticated EXECUTE with no correlated PUBLIC row)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: [...PLATFORM_BASELINE.privileges, AUTHENTICATED_EXECUTE_WITHOUT_PUBLIC_SIBLING],
      }),
      pending: [],
      statement: CREATE_SET_ROLE_PERMISSION,
    });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("set_role_permission");
    expect(result.pending).toEqual([]);
  });

  it("grants the same grace to CREATE PROCEDURE, matched by object_class rather than assumed to be a function", () => {
    const CREATE_A_PROCEDURE = {
      type: "create",
      objectClass: "procedure",
      identity: "public.archive_branch(uuid)",
    };

    const PROCEDURE_EXECUTE_ROWS = [
      {
        grantee: "public",
        object_class: "procedure",
        object: "public.archive_branch(uuid)",
        privilege: "execute",
        column: null,
      },
      {
        grantee: "authenticated",
        object_class: "procedure",
        object: "public.archive_branch(uuid)",
        privilege: "execute",
        column: null,
      },
    ];

    const result = assertPreFinalStatementBoundary({
      label: "boundary N (CREATE PROCEDURE statement, probe-shaped)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, ...PROCEDURE_EXECUTE_ROWS] }),
      pending: [],
      statement: CREATE_A_PROCEDURE,
    });

    expect(result.problems).toEqual([]);
    expect(result.pending).toHaveLength(2);
  });

  it("never treats the accepted extension-schema exception as pending", () => {
    const result = assertPreFinalStatementBoundary({
      label: "boundary N",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: [
          ...PLATFORM_BASELINE.privileges,
          {
            grantee: "public",
            object_class: "function",
            object: "extensions.pgtap_version()",
            privilege: "execute",
            column: null,
          },
        ],
      }),
      pending: [],
      statement: { type: "create", objectClass: "function", identity: "extensions.pgtap_version()" },
    });

    expect(result.problems).toEqual([]);
    expect(result.pending).toEqual([]);
  });

  it("still enforces structural expectations every statement, ungraced", () => {
    const result = assertPreFinalStatementBoundary({
      label: "boundary N",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: PLATFORM_BASELINE.privileges,
        public_tables_without_rls: ["public.branches"],
      }),
      pending: [],
      statement: NOT_A_CREATE,
    });

    expect(result.problems.join("\n")).toContain("row level security disabled");
  });

  it("does not grant grace to an unexpected privilege merely because it disappears next statement", () => {
    const UNEXPECTED_GRANT = {
      grantee: "authenticated",
      object_class: "table",
      object: "public.audit_events",
      privilege: "delete",
      column: null,
    };
    const afterGrant = snapshot({ privileges: [...PLATFORM_BASELINE.privileges, UNEXPECTED_GRANT] });

    const first = assertPreFinalStatementBoundary({
      label: "boundary N (unexplained privilege appears)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: afterGrant,
      pending: [],
      statement: NOT_A_CREATE,
    });

    // Fails immediately, at first appearance — it must not wait a statement to
    // see whether a later REVOKE happens to clean it up.
    expect(first.problems).toHaveLength(1);
    expect(first.problems[0]).toContain("audit_events");
    expect(first.problems[0]).not.toContain("adjacent");
    expect(first.pending).toEqual([]);

    const second = assertPreFinalStatementBoundary({
      label: "boundary N+1 (removed by REVOKE)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: afterGrant,
      snapshot: snapshot({ privileges: PLATFORM_BASELINE.privileges }),
      pending: first.pending,
      statement: NOT_A_CREATE,
    });

    // Already reported once; not re-flagged, but never silently accepted either.
    expect(second.problems).toEqual([]);
  });

  it("does not grant grace to a default privilege that does not belong to the statement just executed", () => {
    // NEW_FUNCTION_EXECUTE appears, but the statement just run created a
    // *different* function. The privilege cannot be that statement's own
    // PostgreSQL default, so it must fail immediately rather than wait.
    const result = assertPreFinalStatementBoundary({
      label: "boundary N (unrelated CREATE FUNCTION)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE] }),
      pending: [],
      statement: CREATE_SET_MEMBER_ROLE,
    });

    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain("set_role_permission");
    expect(result.pending).toEqual([]);
  });

  it("attributes two interleaved privilege-bearing creates to their own objects independently", () => {
    // Statement 1: CREATE FUNCTION set_role_permission — its own default appears.
    const afterFirstCreate = snapshot({
      privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE],
    });

    const first = assertPreFinalStatementBoundary({
      label: "boundary 1 (CREATE FUNCTION set_role_permission)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: afterFirstCreate,
      pending: [],
      statement: CREATE_SET_ROLE_PERMISSION,
    });

    expect(first.problems).toEqual([]);
    expect(first.pending).toHaveLength(1);

    // Statement 2: a second CREATE FUNCTION, before the first's REVOKE has run.
    // Object A's grace was for exactly one statement — this next statement is
    // it, and a different CREATE intervened rather than A's own adjacent
    // REVOKE, so A is a real ADR-017 violation right here, not still-graced.
    // Object B, created by *this* statement, gets its own fresh grace.
    const afterSecondCreate = snapshot({
      privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE, NEW_MEMBER_ROLE_EXECUTE],
    });

    const second = assertPreFinalStatementBoundary({
      label: "boundary 2 (CREATE FUNCTION set_member_role)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: afterFirstCreate,
      snapshot: afterSecondCreate,
      pending: first.pending,
      statement: CREATE_SET_MEMBER_ROLE,
    });

    expect(second.problems).toHaveLength(1);
    expect(second.problems[0]).toContain("set_role_permission");
    expect(second.problems[0]).toContain("adjacent");
    expect(second.pending).toHaveLength(1);
    expect(second.pending[0].key).toContain("set_member_role");

    // Statement 3: object A already reported and dropped from tracking; object
    // B is now on its own "following statement" and still present, so it — and
    // only it — is reported here.
    const third = assertPreFinalStatementBoundary({
      label: "boundary 3 (still no REVOKE for set_member_role)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: afterSecondCreate,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, NEW_MEMBER_ROLE_EXECUTE] }),
      pending: second.pending,
      statement: NOT_A_CREATE,
    });

    expect(third.problems).toHaveLength(1);
    expect(third.problems[0]).toContain("set_member_role");
    expect(third.problems[0]).not.toContain("set_role_permission");
  });

  it("does not re-admit an already-reported violation into pending when a later CREATE OR REPLACE targets the same object", () => {
    // Reproduces the exact Codex-identified failure: an unrelated statement
    // introduces a PUBLIC/anon/authenticated EXECUTE trio on some function Q
    // that this statement did NOT create (so it is reported immediately, and
    // — being a real violation, not a grace candidate — never enters
    // `pending`). If "newly added" were computed as "anything beyond baseline
    // that isn't already pending" (the pre-fix behavior), that stale,
    // still-present trio would look "new" again at any later boundary and — if
    // that later statement happens to CREATE OR REPLACE the very same object —
    // would satisfy the sibling-correlation check and get waved through as
    // that statement's own default, vanishing from view instead of remaining a
    // violation.
    const Q_ROWS = [
      { grantee: "public", object_class: "function", object: "public.q()", privilege: "execute", column: null },
      { grantee: "anon", object_class: "function", object: "public.q()", privilege: "execute", column: null },
      {
        grantee: "authenticated",
        object_class: "function",
        object: "public.q()",
        privilege: "execute",
        column: null,
      },
    ];
    const afterUnrelatedStatement = snapshot({ privileges: [...PLATFORM_BASELINE.privileges, ...Q_ROWS] });

    const first = assertPreFinalStatementBoundary({
      label: "boundary 1 (unrelated statement grants Q's trio)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: afterUnrelatedStatement,
      pending: [],
      statement: NOT_A_CREATE,
    });

    expect(first.problems).toHaveLength(3);
    expect(first.pending).toEqual([]);

    // Statement 2: CREATE OR REPLACE FUNCTION q() — same object, snapshot
    // unchanged (nothing was actually added since the immediately preceding
    // statement). Must not re-grace Q's rows into pending, and must not
    // re-report them either — they were already reported once, at boundary 1.
    const CREATE_Q = { type: "create", objectClass: "function", identity: "public.q()" };

    const second = assertPreFinalStatementBoundary({
      label: "boundary 2 (CREATE OR REPLACE FUNCTION q(), snapshot unchanged)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: afterUnrelatedStatement,
      snapshot: afterUnrelatedStatement,
      pending: first.pending,
      statement: CREATE_Q,
    });

    expect(second.problems).toEqual([]);
    expect(second.pending).toEqual([]);
  });

  it("does not let an unrelated PUBLIC row correlate with this statement's own anon/authenticated row for a different object", () => {
    // A CREATE FUNCTION y() statement whose diff (relative to the immediately
    // preceding statement) happens to contain two unrelated new rows in the
    // same batch: PUBLIC EXECUTE on a *different* function z() (not created by
    // this statement), and authenticated EXECUTE on y() itself with no
    // correlated PUBLIC EXECUTE row for y() present. Neither may be graced:
    // the PUBLIC row fails the same-object check against the statement's own
    // identity, and the authenticated row fails the sibling-correlation check
    // because the only PUBLIC row in the newly-added set names a different
    // object.
    const CREATE_Y = { type: "create", objectClass: "function", identity: "public.y()" };
    const NEW_ROWS = [
      { grantee: "public", object_class: "function", object: "public.z()", privilege: "execute", column: null },
      {
        grantee: "authenticated",
        object_class: "function",
        object: "public.y()",
        privilege: "execute",
        column: null,
      },
    ];

    const result = assertPreFinalStatementBoundary({
      label: "boundary N (CREATE FUNCTION y(), unrelated PUBLIC-z sibling noise)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: [...PLATFORM_BASELINE.privileges, ...NEW_ROWS] }),
      pending: [],
      statement: CREATE_Y,
    });

    expect(result.problems).toHaveLength(2);
    expect(result.problems.some((problem) => problem.includes("public.z()"))).toBe(true);
    expect(result.problems.some((problem) => problem.includes("public.y()"))).toBe(true);
    expect(result.pending).toEqual([]);
  });
});

describe("assertStatementModeFile (per-file grace reset)", () => {
  const CREATE_SET_ROLE_PERMISSION_SQL = `
    create function public.set_role_permission(p_role_id uuid, p_permission text, p_granted boolean)
    returns void
    language plpgsql
    security definer
    set search_path = ''
    as $$ begin null; end; $$;
    revoke execute on function public.set_role_permission(uuid, text, boolean) from public;
  `;

  const NEW_FUNCTION_EXECUTE = {
    grantee: "public",
    object_class: "function",
    object: "public.set_role_permission(uuid, text, boolean)",
    privilege: "execute",
    column: null,
  };

  it("catches a function whose adjacent REVOKE never runs, by the file's own boundary check", () => {
    // Deliberately drop the REVOKE statement to prove nothing downstream
    // silently closes it: only two statements, so the grace window is
    // exhausted by the last one and never rechecked at a following statement
    // inside this function — that's the job of the caller's ungraced
    // "boundary after <file>" check, run separately after this returns.
    const source = `
      create function public.set_role_permission(p_role_id uuid, p_permission text, p_granted boolean)
      returns void
      language plpgsql
      security definer
      set search_path = ''
      as $$ begin null; end; $$;
    `;
    const statements = splitSqlStatements(source, "0100_leaves_open.sql");
    const afterCreate = snapshot({
      privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE],
    });

    const result = assertStatementModeFile({
      file: { name: "0100_leaves_open.sql" },
      statements,
      snapshots: [afterCreate],
      baselineSnapshot: PLATFORM_BASELINE,
      isTerminal: false,
      previousSnapshot: PLATFORM_BASELINE,
    });

    // Within this one-statement file, nothing has failed yet — that's correct:
    // grace for the CREATE's own default has not been checked against a
    // following statement because there isn't one in this file.
    expect(result.problems).toEqual([]);
    expect(result.previousSnapshot).toBe(afterCreate);

    // The still-open entry must be visible to the caller's own ungraced
    // "boundary after <file>" check — assertStatementModeFile does not, and
    // must not, swallow it.
    const fileBoundaryProblems = assertPreFinalBoundary({
      label: "boundary after 0100_leaves_open.sql",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: result.previousSnapshot,
    });

    expect(fileBoundaryProblems.join("\n")).toContain("set_role_permission");
  });

  it("does not leak file one's pendingGrace into file two, and does not re-flag an already-caught carried-over privilege as newly appeared", () => {
    // File one deliberately omits the REVOKE (unlike
    // CREATE_SET_ROLE_PERMISSION_SQL above), so its pending grace is genuinely
    // non-empty when the file ends — the exact state a carryover bug would
    // need to leak for this test to mean anything.
    //
    // Grace's "newly added" set is now correctly relative to the actual
    // preceding statement snapshot (this checkpoint's fix for the Codex
    // finding that it was previously derived from "beyond baseline and not
    // already pending" — a proxy that let an already-reported, never-revoked
    // violation re-enter the newly-added set at a later, unrelated boundary).
    // The privilege carried over from file one is therefore not "newly
    // added" at file two's first statement — it already existed before file
    // two started — so file two's own inner statement-mode check correctly
    // stays silent about it. That is not a masked violation: it was already
    // reported once, at the point it first appeared, and the caller's own
    // ungraced "boundary after <file>" check (proven by the neighboring test
    // above) catches it independently at every file boundary where it
    // remains. What must never happen, and what this test actually proves, is
    // a *leaked* `pendingGrace`: if assertStatementModeFile ever started
    // threading `pendingGrace` across calls instead of always initializing it
    // fresh per file, file two would instead report the entry as an
    // "adjacent" violation (the message a real pending carryover produces),
    // which is a different — and wrong — failure mode from silence.
    const firstFileSource = `
      create function public.set_role_permission(p_role_id uuid, p_permission text, p_granted boolean)
      returns void
      language plpgsql
      security definer
      set search_path = ''
      as $$ begin null; end; $$;
    `;
    const firstFileStatements = splitSqlStatements(firstFileSource, "0100_leaves_open.sql");
    const afterCreate = snapshot({
      privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE],
    });

    const firstFile = assertStatementModeFile({
      file: { name: "0100_leaves_open.sql" },
      statements: firstFileStatements,
      snapshots: [afterCreate],
      baselineSnapshot: PLATFORM_BASELINE,
      isTerminal: false,
      previousSnapshot: PLATFORM_BASELINE,
    });

    // Nothing has failed yet inside file one — correct, since there is no
    // following statement within this file to check the grace against. This
    // is the moment `pendingGrace` holds the still-open entry.
    expect(firstFile.problems).toEqual([]);

    const secondFileStatements = splitSqlStatements(
      "select 1;",
      "0101_unrelated.sql",
    );
    const secondFileSnapshot = snapshot({
      privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE],
    });

    // Control: this is what a LEAKED pendingGrace would actually produce —
    // not silence, but the "adjacent" message, because
    // assertPreFinalStatementBoundary reports any surviving pending key that
    // way regardless of which file opened the grace. Reusing the exact
    // pending array file one's own CREATE produced (via a direct, ungraced
    // call to assertPreFinalStatementBoundary, mirroring the "reports it as a
    // real violation if it is still present the following statement" case
    // above) makes this the true leaked-state comparison, not a guess at its
    // shape.
    const openedByCreate = assertPreFinalStatementBoundary({
      label: "control (file one's own CREATE, for its pending shape only)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: PLATFORM_BASELINE,
      snapshot: afterCreate,
      pending: [],
      statement: {
        type: "create",
        objectClass: "function",
        identity: "public.set_role_permission(uuid, text, boolean)",
      },
    });
    const leakedPendingControl = assertPreFinalStatementBoundary({
      label: "control (leaked pendingGrace carried into file two)",
      baselineSnapshot: PLATFORM_BASELINE,
      previousSnapshot: afterCreate,
      snapshot: secondFileSnapshot,
      pending: openedByCreate.pending,
      statement: { type: "other" },
    });
    expect(leakedPendingControl.problems).toHaveLength(1);
    expect(leakedPendingControl.problems[0]).toContain("adjacent");

    // The real assertStatementModeFile call for file two: per-file grace
    // reset means pendingGrace is empty going in, and the privilege is not
    // newly added relative to the real preceding snapshot (file one's own
    // last snapshot, which already held it), so file two reports nothing of
    // its own — the opposite of, and clearly distinguishable from, the
    // leaked-control result above.
    const secondFile = assertStatementModeFile({
      file: { name: "0101_unrelated.sql" },
      statements: secondFileStatements,
      snapshots: [secondFileSnapshot],
      baselineSnapshot: PLATFORM_BASELINE,
      isTerminal: false,
      previousSnapshot: firstFile.previousSnapshot,
    });

    expect(secondFile.problems).toEqual([]);
    expect(secondFile.problems).not.toEqual(leakedPendingControl.problems);
  });

  it("reports assertSnapshotUsable and assertExaminedGrowth problems per statement", () => {
    const statements = splitSqlStatements(
      "revoke all on table public.branches from anon;",
      "0100_single.sql",
    );
    const previous = snapshot({ examined: { schemas: 6, tables: 11 } });
    const regressed = snapshot({
      privileges: [],
      examined: { schemas: 6, tables: 10 },
    });

    const result = assertStatementModeFile({
      file: { name: "0100_single.sql" },
      statements,
      snapshots: [regressed],
      baselineSnapshot: PLATFORM_BASELINE,
      isTerminal: false,
      previousSnapshot: previous,
    });

    expect(result.problems.join("\n")).toContain("fewer tables");
  });

  it("still enforces adjacent default-privilege revocation inside a terminal migration", () => {
    const statements = splitSqlStatements(
      CREATE_SET_ROLE_PERMISSION_SQL,
      "9999_terminal.sql",
    );
    const afterCreate = snapshot({
      privileges: [...PLATFORM_BASELINE.privileges, NEW_FUNCTION_EXECUTE],
    });

    const result = assertStatementModeFile({
      file: { name: "9999_terminal.sql" },
      statements,
      snapshots: [afterCreate, afterCreate],
      baselineSnapshot: PLATFORM_BASELINE,
      isTerminal: true,
      allowedTerminalMigrations: TERMINAL_MIGRATIONS,
      previousSnapshot: PLATFORM_BASELINE,
    });

    expect(result.problems.join("\n")).toContain("adjacent");
  });

  it("rejects an unapproved privilege introduced inside a terminal migration", () => {
    const statements = splitSqlStatements(
      "grant insert on public.audit_events to authenticated;",
      "9999_terminal.sql",
    );
    const unapprovedInsert = {
      grantee: "authenticated",
      object_class: "table",
      object: "public.audit_events",
      privilege: "insert",
      column: null,
    };

    const result = assertStatementModeFile({
      file: { name: "9999_terminal.sql" },
      statements,
      snapshots: [
        snapshot({
          privileges: [...PLATFORM_BASELINE.privileges, unapprovedInsert],
        }),
      ],
      baselineSnapshot: PLATFORM_BASELINE,
      isTerminal: true,
      allowedTerminalMigrations: TERMINAL_MIGRATIONS,
      previousSnapshot: PLATFORM_BASELINE,
    });

    expect(result.problems.join("\n")).toContain(
      "not a known PostgreSQL default privilege",
    );
  });
});

describe("multiple grant-terminal migrations", () => {
  it("expects only the approved grants whose terminal file has been reached", () => {
    const [baselineTerminal, branchLifecycleTerminal] = TERMINAL_MIGRATIONS;

    expect(
      boundaryRunner.terminalMigrationsThroughFile(
        TERMINAL_MIGRATIONS,
        baselineTerminal.file,
      ),
    ).toEqual([baselineTerminal]);
    expect(
      boundaryRunner.terminalMigrationsThroughFile(
        TERMINAL_MIGRATIONS,
        branchLifecycleTerminal.file,
      ),
    ).toEqual([baselineTerminal, branchLifecycleTerminal]);
  });
});

describe("the grant-terminal boundary", () => {
  it("passes when the effective privilege set equals baseline plus the approved set", () => {
    expect(
      assertFinalBoundary({
        label: "final",
        baselineSnapshot: PLATFORM_BASELINE,
        snapshot: snapshot({ privileges: APPROVED_FINAL_PRIVILEGES }),
        terminalMigrations: TERMINAL_MIGRATIONS,
      }),
    ).toEqual([]);
  });

  it("fails on one extra effective privilege", () => {
    const problems = assertFinalBoundary({
      label: "final",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: [
          ...APPROVED_FINAL_PRIVILEGES,
          {
            grantee: "authenticated",
            object_class: "table",
            object: "public.audit_events",
            privilege: "insert",
            column: null,
          },
        ],
      }),
      terminalMigrations: TERMINAL_MIGRATIONS,
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("not in the approved final privilege set");
  });

  it("fails when the self-service column grant is one column wider than approved", () => {
    const problems = assertFinalBoundary({
      label: "final",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: [
          ...APPROVED_FINAL_PRIVILEGES,
          {
            grantee: "authenticated",
            object_class: "column",
            object: "public.profiles",
            privilege: "update",
            column: "user_id",
          },
        ],
      }),
      terminalMigrations: TERMINAL_MIGRATIONS,
    });

    // The widened column set is a different entry, so the approved one is
    // reported missing and the widened one unapproved.
    expect(problems).toHaveLength(2);
    expect(problems.join("\n")).toContain("user_id");
  });

  it("fails when an approved privilege is not effectively present", () => {
    const problems = assertFinalBoundary({
      label: "final",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: APPROVED_FINAL_PRIVILEGES.filter(
          (entry) => entry.object !== "public.audit_events",
        ),
      }),
      terminalMigrations: TERMINAL_MIGRATIONS,
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("does not grant it effectively");
  });

  it("does not expect server-only service_role grants from a browser-role probe", () => {
    const approved = browserReachableApprovedKeys(TERMINAL_MIGRATIONS);

    expect([...approved.keys()].some((key) => key.startsWith("service_role"))).toBe(false);
    expect(approved.size).toBe(263);
  });

  it("excludes a superseded historical signature from the observable final set", () => {
    // Mirrors the confirm_file_upload verified-size replacement: the old
    // terminal file's immutable grant must still satisfy the static per-file
    // lint, but the live catalog no longer holds the privilege, so the final
    // boundary (no boundary file given = end of chain) must not demand it
    // effectively.
    const terminals = [
      {
        file: "0100_terminal.sql",
        grants: [
          {
            grantee: "authenticated",
            objectClass: "function",
            object: "public.confirm(uuid,uuid,integer)",
            privilege: "execute",
            columns: [],
            supersededBy: "public.confirm(uuid,uuid,integer,bigint)",
            supersededFrom: "0110_terminal.sql",
            reason: "Historical signature replaced by the verified-size migration.",
          },
        ],
      },
      {
        file: "0110_terminal.sql",
        grants: [
          {
            grantee: "authenticated",
            objectClass: "function",
            object: "public.confirm(uuid,uuid,integer,bigint)",
            privilege: "execute",
            columns: [],
            reason: "The replacement signature persisting the server-verified size.",
          },
        ],
      },
    ];

    const approved = browserReachableApprovedKeys(terminals);
    const keys = [...approved.keys()];

    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe(
      "authenticated | function | public.confirm(uuid,uuid,integer,bigint) | execute | ",
    );

    expect(
      assertFinalBoundary({
        label: "final",
        baselineSnapshot: PLATFORM_BASELINE,
        snapshot: snapshot({
          privileges: [
            ...PLATFORM_BASELINE.privileges,
            {
              grantee: "authenticated",
              object_class: "function",
              object: "public.confirm(uuid, uuid, integer, bigint)",
              privilege: "execute",
              column: null,
            },
          ],
        }),
        terminalMigrations: terminals,
      }),
    ).toEqual([]);
  });
});

describe("boundary-aware superseded-grant replay windows", () => {
  const OLD_CONFIRM_KEY =
    "authenticated | function | public.confirm_file_upload(uuid,uuid,integer) | execute | ";
  const NEW_CONFIRM_KEY =
    "authenticated | function | public.confirm_file_upload(uuid,uuid,integer,bigint) | execute | ";
  const CONFIRM_GRANT_FILE = "20260826010701_patient_file_upload_rpcs_grants.sql";
  const REVOKING_FILE = "20260826011100_confirm_file_upload_verified_size.sql";
  const REPLACEMENT_GRANT_FILE = "20260826011101_confirm_file_upload_verified_size_grants.sql";

  /**
   * Synthetic mirror of the reviewed chain shape: grant the old signature at
   * 0100, an unrelated grant-terminal at 0200, revoke via a registered (empty)
   * terminal at 0300, and grant the replacement signature at 0301.
   */
  function replayTerminals() {
    return [
      {
        file: "0100_confirm_grants.sql",
        grants: [
          {
            grantee: "authenticated",
            objectClass: "function",
            object: "public.confirm_file_upload(uuid,uuid,integer)",
            privilege: "execute",
            columns: [],
            supersededBy: "public.confirm_file_upload(uuid,uuid,integer,bigint)",
            supersededFrom: "0300_confirm_verified_size.sql",
            reason: "Historical three-argument signature.",
          },
        ],
      },
      { file: "0200_unrelated_grants.sql", grants: [] },
      { file: "0300_confirm_verified_size.sql", grants: [] },
      {
        file: "0301_confirm_verified_size_grants.sql",
        grants: [
          {
            grantee: "authenticated",
            objectClass: "function",
            object: "public.confirm_file_upload(uuid,uuid,integer,bigint)",
            privilege: "execute",
            columns: [],
            reason: "The verified-size replacement signature.",
          },
        ],
      },
    ];
  }

  const OLD_CONFIRM_ROW = {
    grantee: "authenticated",
    object_class: "function",
    object: "public.confirm_file_upload(uuid, uuid, integer)",
    privilege: "execute",
    column: null,
  };

  it("expects the superseded three-argument confirm grant at every registered boundary before its revoking migration", () => {
    for (const file of [
      CONFIRM_GRANT_FILE,
      "20260826010801_patient_file_read_rpcs_grants.sql",
      "20260826010901_patient_file_archive_rpc_grants.sql",
      "20260826011001_patient_file_metadata_object_key_grants.sql",
    ]) {
      const approved = browserReachableApprovedKeys(TERMINAL_MIGRATIONS, file);

      expect(approved.has(OLD_CONFIRM_KEY), file).toBe(true);
      expect(approved.has(NEW_CONFIRM_KEY), file).toBe(false);
    }
  });

  it("drops the old signature exactly at the revoking migration and picks up the replacement from its own granting file", () => {
    // Boundary after the revoking object migration: the old signature is gone
    // and the replacement grant has not been applied yet.
    const atRevocation = browserReachableApprovedKeys(TERMINAL_MIGRATIONS, REVOKING_FILE);
    expect(atRevocation.has(OLD_CONFIRM_KEY)).toBe(false);
    expect(atRevocation.has(NEW_CONFIRM_KEY)).toBe(false);

    const atReplacement = browserReachableApprovedKeys(TERMINAL_MIGRATIONS, REPLACEMENT_GRANT_FILE);
    expect(atReplacement.has(OLD_CONFIRM_KEY)).toBe(false);
    expect(atReplacement.has(NEW_CONFIRM_KEY)).toBe(true);

    const finalState = browserReachableApprovedKeys(TERMINAL_MIGRATIONS);
    expect(finalState.has(OLD_CONFIRM_KEY)).toBe(false);
    expect(finalState.has(NEW_CONFIRM_KEY)).toBe(true);
  });

  it("passes the intermediate boundary where the catalog legitimately still holds the old signature", () => {
    // The exact false violation finding A removes: between the granting and
    // revoking migrations the live EXECUTE grant must satisfy the boundary.
    expect(
      assertFinalBoundary({
        label: "boundary after 0200_unrelated_grants.sql",
        baselineSnapshot: PLATFORM_BASELINE,
        snapshot: snapshot({
          privileges: [...PLATFORM_BASELINE.privileges, OLD_CONFIRM_ROW],
        }),
        terminalMigrations: replayTerminals(),
        throughFile: "0200_unrelated_grants.sql",
      }),
    ).toEqual([]);
  });

  it("fails closed when the old signature survives past its revoking migration", () => {
    const problems = assertFinalBoundary({
      label: "boundary after 0300_confirm_verified_size.sql",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({
        privileges: [...PLATFORM_BASELINE.privileges, OLD_CONFIRM_ROW],
      }),
      terminalMigrations: replayTerminals(),
      throughFile: "0300_confirm_verified_size.sql",
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("public.confirm_file_upload(uuid,uuid,integer)");
    expect(problems[0]).toContain("not in the approved final privilege set");
  });

  it("fails closed when the old signature is missing before its revoking migration", () => {
    const problems = assertFinalBoundary({
      label: "boundary after 0100_confirm_grants.sql",
      baselineSnapshot: PLATFORM_BASELINE,
      snapshot: snapshot({ privileges: PLATFORM_BASELINE.privileges }),
      terminalMigrations: replayTerminals(),
      throughFile: "0100_confirm_grants.sql",
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("public.confirm_file_upload(uuid,uuid,integer)");
    expect(problems[0]).toContain("does not grant it effectively");
  });

  it("refuses to compute expectations from a superseded entry that does not name its revoking migration", () => {
    expect(() =>
      browserReachableApprovedKeys([
        {
          file: "0100_confirm_grants.sql",
          grants: [
            {
              grantee: "authenticated",
              objectClass: "function",
              object: "public.confirm_file_upload(uuid,uuid,integer)",
              privilege: "execute",
              columns: [],
              supersededBy: "public.confirm_file_upload(uuid,uuid,integer,bigint)",
              reason: "Historical three-argument signature.",
            },
          ],
        },
      ]),
    ).toThrow(/supersededFrom/);
  });
});

describe("supersede-reference validation of the approved registry", () => {
  it("accepts the committed registry", () => {
    expect(() => assertSupersedeReferencesResolve(TERMINAL_MIGRATIONS)).not.toThrow();
  });

  function registryWithSupersededEntryMutated(mutation) {
    return structuredClone(TERMINAL_MIGRATIONS).map((terminal) => ({
      ...terminal,
      grants: terminal.grants.map((grant) =>
        grant.supersededBy || grant.supersededFrom ? mutation(grant) : grant,
      ),
    }));
  }

  it("rejects a supersededFrom that is not a migration file", () => {
    const broken = registryWithSupersededEntryMutated((grant) => ({
      ...grant,
      supersededFrom: "19990101000000_never_registered.sql",
    }));

    expect(() => assertSupersedeReferencesResolve(broken)).toThrow(
      /is not a \.sql file in supabase\/migrations/,
    );
  });

  it("rejects a supersededBy naming an object no registered grant carries", () => {
    const broken = registryWithSupersededEntryMutated((grant) => ({
      ...grant,
      supersededBy: "public.confirm_file_upload(uuid,uuid,text)",
    }));

    expect(() => assertSupersedeReferencesResolve(broken)).toThrow(
      /no registered terminal migration grants/,
    );
  });

  it("rejects a supersede marker that does not record its revoking migration", () => {
    const broken = registryWithSupersededEntryMutated((grant) => ({
      ...grant,
      supersededFrom: undefined,
    }));

    expect(() => assertSupersedeReferencesResolve(broken)).toThrow(
      /without supersededFrom/,
    );
  });
});

describe("the R6-D execution gate", () => {
  it("refuses to run without the explicit approval argument", () => {
    expect(() =>
      assertR6dExecutionIsApproved([], {
        R6D_BOUNDARY_TEST_CONFIRMATION: R6D_BOUNDARY_TEST_CONFIRMATION,
      }),
    ).toThrow(/R6-D has not been approved/);
  });

  it("refuses to run without the exact target confirmation", () => {
    expect(() => assertR6dExecutionIsApproved(["--approved-r6d"], {})).toThrow(
      /does not authorize/,
    );

    expect(() =>
      assertR6dExecutionIsApproved(["--approved-r6d"], {
        R6D_BOUNDARY_TEST_CONFIRMATION: "yes",
      }),
    ).toThrow(/does not authorize/);
  });

  it("passes only when both gates are satisfied deliberately", () => {
    expect(() =>
      assertR6dExecutionIsApproved(["--approved-r6d"], {
        R6D_BOUNDARY_TEST_CONFIRMATION: R6D_BOUNDARY_TEST_CONFIRMATION,
      }),
    ).not.toThrow();
  });

  it("offers only the two reviewed replay modes", () => {
    expect(resolveMode([])).toBe("file");
    expect(resolveMode(["--mode=statement"])).toBe("statement");
    expect(() => resolveMode(["--mode=whatever"])).toThrow(/--mode must be/);
  });
});

describe("resolveQueryArgs (IPv6-unsupported network fallback)", () => {
  it("uses --linked by default when no override is set", () => {
    expect(
      resolveQueryArgs("snapshot.sql", true, {
        override: undefined,
        linkedProjectId: "abcdefghijklmnopqrst",
      }),
    ).toEqual(["db", "query", "--linked", "--output-format", "json", "--file", "snapshot.sql"]);
  });

  it("omits --output-format when json is false, regardless of override", () => {
    expect(
      resolveQueryArgs("statement.sql", false, {
        override: undefined,
        linkedProjectId: "abcdefghijklmnopqrst",
      }),
    ).toEqual(["db", "query", "--linked", "--file", "statement.sql"]);
  });

  it("uses --db-url when the override references the linked TEST project", () => {
    const override =
      "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";

    expect(
      resolveQueryArgs("snapshot.sql", true, {
        override,
        linkedProjectId: "abcdefghijklmnopqrst",
      }),
    ).toEqual(["db", "query", "--db-url", override, "--output-format", "json", "--file", "snapshot.sql"]);
  });

  it("refuses an override that does not reference the linked project", () => {
    const override =
      "postgresql://postgres.someotherref00000000:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres";

    expect(() =>
      resolveQueryArgs("snapshot.sql", true, {
        override,
        linkedProjectId: "abcdefghijklmnopqrst",
      }),
    ).toThrow(/does not reference the linked TEST project/);
  });

  it("refuses an override when there is no linked project to compare against", () => {
    expect(() =>
      resolveQueryArgs("snapshot.sql", true, {
        override: "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
        linkedProjectId: null,
      }),
    ).toThrow(/does not reference the linked TEST project/);
  });
});

describe("assertOverrideTargetsLinkedProject (shared by the CLI and psql fallback paths)", () => {
  it("passes for a Session Pooler URL matching the linked project", () => {
    expect(() =>
      assertOverrideTargetsLinkedProject(
        "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
        "abcdefghijklmnopqrst",
      ),
    ).not.toThrow();
  });

  it("passes for a direct-connection URL matching the linked project", () => {
    expect(() =>
      assertOverrideTargetsLinkedProject(
        "postgresql://postgres:pw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres",
        "abcdefghijklmnopqrst",
      ),
    ).not.toThrow();
  });

  it("refuses an override for a different project (same shape, different ref)", () => {
    expect(() =>
      assertOverrideTargetsLinkedProject(
        "postgresql://postgres.someotherref00000000:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
        "abcdefghijklmnopqrst",
      ),
    ).toThrow(/does not reference the linked TEST project/);
  });

  it("refuses an override with the real ref hidden elsewhere in the URL but pointed at an unrelated host", () => {
    expect(() =>
      assertOverrideTargetsLinkedProject(
        "postgresql://postgres:pw@evil-attacker-host.example.com:5432/postgres?note=abcdefghijklmnopqrst",
        "abcdefghijklmnopqrst",
      ),
    ).toThrow(/does not reference the linked TEST project/);
  });

  it("refuses a URL on the right project ref but an unapproved host suffix", () => {
    expect(() =>
      assertOverrideTargetsLinkedProject(
        "postgresql://postgres.abcdefghijklmnopqrst:pw@abcdefghijklmnopqrst.evil-mirror.example.com:5432/postgres",
        "abcdefghijklmnopqrst",
      ),
    ).toThrow(/does not reference the linked TEST project/);
  });

  it("refuses a value that is not a valid URL at all", () => {
    expect(() =>
      assertOverrideTargetsLinkedProject("not a url", "abcdefghijklmnopqrst"),
    ).toThrow(/does not reference the linked TEST project/);
  });

  it("refuses when there is no linked project to compare against", () => {
    expect(() =>
      assertOverrideTargetsLinkedProject(
        "postgresql://postgres.abcdefghijklmnopqrst:pw@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres",
        null,
      ),
    ).toThrow(/does not reference the linked TEST project/);
  });
});

describe("baseline diffing", () => {
  it("reports privileges removed from the platform baseline as well as added", () => {
    const { added, removed } = diffAgainstBaseline(
      PLATFORM_BASELINE,
      snapshot({ privileges: PLATFORM_BASELINE.privileges.slice(0, 1) }),
    );

    expect(added).toEqual([]);
    expect(removed).toHaveLength(2);
  });
});
