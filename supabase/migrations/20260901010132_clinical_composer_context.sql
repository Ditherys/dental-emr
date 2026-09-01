-- Unified Clinical Chart workspace, task 7: the read-only projection that makes
-- the shared composer's forms usable.
--
-- Task 6 built the treatment-event form behind a `TreatmentComposerContext` —
-- procedures, resolvable findings, plan items, open procedure cases and payment
-- methods — and nothing supplied it, so no clinician could open the form. Task 7
-- adds the bridge and implant forms, which additionally need the charge a
-- relationship may reference and the implant components a bridge abutment may
-- be supported by.
--
-- All of it is one authorized server read. The browser never decides which
-- procedure, case, finding or charge is eligible: this function decides, inside
-- a SECURITY DEFINER body with an empty search path, from the tenant it derives
-- itself. It writes nothing — no row, no state change and no audit event — so
-- opening the composer never opens an encounter.

create function public.get_clinical_composer_context(
  p_branch_id uuid,
  p_patient_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_may_charge boolean;
  v_may_take_payment boolean;
  v_identifier text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(p_branch_id, 'patient.clinical.read') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select patient.patient_number || ' · ' || patient.last_name || ', ' || patient.first_name
    into v_identifier
  from public.patients as patient
  where patient.id = p_patient_id and patient.organization_id = v_organization_id;

  if v_identifier is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_may_charge := private.has_billing_permission_at_branch(p_branch_id, 'billing.charge');
  v_may_take_payment := private.has_billing_permission_at_branch(p_branch_id, 'payment.record');

  return pg_catalog.jsonb_build_object(
    'patient_id', p_patient_id,
    'patient_identifier', v_identifier,

    'procedures', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('procedure_id', listed.id, 'name', listed.name)
        order by listed.name
      )
      from (
        select procedure.id, procedure.name
        from public.procedures as procedure
        where procedure.organization_id = v_organization_id and procedure.status = 'active'
        order by procedure.name
        limit 200
      ) as listed
    ), '[]'::jsonb),

    -- Exactly the findings the treatment boundary will accept for resolution:
    -- open, active, unresolved findings for this patient. The form narrows them
    -- further by treated tooth and treatment compatibility; it can never widen
    -- them, because a code the server did not project is not offered at all.
    'active_findings', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'entry_id', listed.id,
          'tooth_code', listed.tooth_code,
          'finding_code', listed.clinical_code,
          'label', listed.tooth_code || ' · ' || pg_catalog.lower(pg_catalog.replace(listed.clinical_code, '_', ' '))
        )
        order by listed.tooth_code, listed.clinical_code
      )
      from (
        select finding.id, finding.tooth_code, finding.clinical_code
        from public.tooth_clinical_entries as finding
        where finding.organization_id = v_organization_id
          and finding.patient_id = p_patient_id
          and finding.kind = 'FINDING'
          and finding.lifecycle = 'OPEN'
          and finding.status = 'ACTIVE'
          and not exists (
            select 1 from public.procedure_case_finding_resolutions as resolution
            where resolution.organization_id = v_organization_id
              and resolution.finding_entry_id = finding.id
          )
        order by finding.tooth_code, finding.clinical_code
        limit 200
      ) as listed
    ), '[]'::jsonb),

    -- A plan item is offered only once the plan workflow has opened its case and
    -- only while that case is still open and carries no charge. A plan item with
    -- no case cannot be completed through the treatment boundary, so offering it
    -- would be a dead end.
    'plan_items', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'plan_item_id', listed.item_id,
          'procedure_case_id', listed.case_id,
          'case_version', listed.case_version,
          'procedure_id', listed.procedure_id,
          'tooth_code', listed.tooth_code,
          'label', listed.tooth_code || ' · ' || listed.name
        )
        order by listed.tooth_code, listed.name
      )
      from (
        select item.id as item_id, procedure_case.id as case_id,
               procedure_case.version as case_version, item.procedure_id,
               item.tooth_code, procedure.name
        from public.treatment_plan_items as item
        join public.treatment_plans as plan
          on plan.organization_id = item.organization_id and plan.id = item.plan_id
        join public.procedure_cases as procedure_case
          on procedure_case.organization_id = item.organization_id
         and procedure_case.treatment_plan_item_id = item.id
        join public.procedures as procedure
          on procedure.organization_id = item.organization_id and procedure.id = item.procedure_id
        where item.organization_id = v_organization_id
          and plan.patient_id = p_patient_id
          and item.tooth_code is not null
          and procedure_case.status = 'OPEN'
          and procedure_case.charge_id is null
        order by item.tooth_code, procedure.name
        limit 100
      ) as listed
    ), '[]'::jsonb),

    'open_cases', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'procedure_case_id', listed.case_id,
          'case_version', listed.case_version,
          'procedure_id', listed.procedure_id,
          'label', listed.name || ' · opened ' || listed.opened_on::text
        )
        order by listed.opened_at desc
      )
      from (
        select procedure_case.id as case_id, procedure_case.version as case_version,
               procedure_case.procedure_id, procedure.name, procedure_case.opened_at,
               (pg_catalog.timezone('Asia/Manila', procedure_case.opened_at))::date as opened_on
        from public.procedure_cases as procedure_case
        join public.procedures as procedure
          on procedure.organization_id = procedure_case.organization_id
         and procedure.id = procedure_case.procedure_id
        where procedure_case.organization_id = v_organization_id
          and procedure_case.patient_id = p_patient_id
          and procedure_case.status = 'OPEN'
        order by procedure_case.opened_at desc
        limit 100
      ) as listed
    ), '[]'::jsonb),

    -- Money is projected only to a caller who already holds the matching billing
    -- permission the write boundary will itself re-check.
    'payment_methods', case when v_may_take_payment then coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('payment_method_id', listed.id, 'name', listed.name)
        order by listed.name
      )
      from (
        select method.id, method.name
        from public.payment_methods as method
        where method.organization_id = v_organization_id and method.active
        order by method.name
        limit 50
      ) as listed
    ), '[]'::jsonb) else '[]'::jsonb end,

    -- A relationship references a charge that already exists. The browser picks
    -- one from this projection instead of typing a financial identifier, and the
    -- write boundary independently revalidates the one it is given.
    'charge_choices', case when v_may_charge then coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'charge_id', listed.id,
          'label', listed.name || ' · ' || pg_catalog.to_char(listed.amount_centavos / 100.0, 'FM999,999,990.00')
            || ' · ' || listed.service_date::text
        )
        order by listed.service_date desc
      )
      from (
        select charge.id, charge.amount_centavos, charge.service_date, procedure.name
        from public.charges as charge
        join public.procedures as procedure
          on procedure.organization_id = charge.organization_id and procedure.id = charge.procedure_id
        where charge.organization_id = v_organization_id
          and charge.patient_id = p_patient_id
        order by charge.service_date desc
        limit 100
      ) as listed
    ), '[]'::jsonb) else '[]'::jsonb end,

    -- The implant abutments a bridge unit may legitimately be supported by:
    -- current, sealed, unvoided abutment components belonging to this patient.
    -- private.validate_bridge_units_payload enforces the same rule server-side.
    'support_components', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'component_id', listed.id,
          'tooth_fdi', listed.tooth_fdi,
          'component_kind', listed.component_kind,
          'label', listed.tooth_fdi || ' · implant abutment'
        )
        order by listed.tooth_fdi
      )
      from (
        select component.id, component.tooth_fdi, component.component_kind
        from public.dental_implant_components as component
        where component.organization_id = v_organization_id
          and component.patient_id = p_patient_id
          and component.record_kind = 'CURRENT'
          and component.component_kind = 'ABUTMENT'
          and component.sealed_at is not null
          and component.voided_at is null
          and not exists (
            select 1 from public.dental_implant_components as successor
            where successor.organization_id = component.organization_id
              and successor.supersedes_component_id = component.id
          )
        order by component.tooth_fdi
        limit 100
      ) as listed
    ), '[]'::jsonb),

    -- The furthest implant stage each tooth has actually reached, so the implant
    -- form can offer the next component instead of a second fixture.
    'implant_stage_by_tooth', coalesce((
      select pg_catalog.jsonb_object_agg(staged.tooth_fdi, staged.stage)
      from (
        select component.tooth_fdi,
               (array_agg(component.component_kind order by component.ordinal desc))[1] as stage
        from public.dental_implant_components as component
        where component.organization_id = v_organization_id
          and component.patient_id = p_patient_id
          and component.record_kind = 'CURRENT'
          and component.sealed_at is not null
          and component.voided_at is null
          and not exists (
            select 1 from public.dental_implant_components as successor
            where successor.organization_id = component.organization_id
              and successor.supersedes_component_id = component.id
          )
        group by component.tooth_fdi
      ) as staged
    ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_clinical_composer_context(uuid,uuid)
from public, anon, authenticated, service_role;

comment on function public.get_clinical_composer_context(uuid,uuid) is
  'The read-only projection the unified clinical chart workspace hands to the shared record composer. It derives organization and actor inside a SECURITY DEFINER body with an empty search path, requires live patient.clinical.read at an active acting branch, and validates the patient against the derived tenant. It decides which procedures, resolvable findings, plan items, open procedure cases, payment methods, charges and implant abutments are eligible, so the browser can never widen the eligible set; money is projected only to a caller holding the matching billing permission the write boundary re-checks. Every projection is bounded, and the function writes nothing at all.';
