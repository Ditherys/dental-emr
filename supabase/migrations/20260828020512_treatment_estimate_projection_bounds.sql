-- Correct the 20260828020507 aggregate bounds: each deterministic LIMIT must
-- constrain source rows before jsonb_agg, not the aggregate's single result.

create or replace function public.get_treatment_plan_detail(
  p_acting_branch_id uuid,
  p_plan_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (
    select 1
    from public.treatment_plans as plan
    where plan.id = p_plan_id
      and plan.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return (
    select jsonb_build_object(
      'plan', jsonb_build_object(
        'planId', plan.id,
        'patientId', plan.patient_id,
        'title', plan.title,
        'status', plan.status,
        'version', plan.version,
        'createdAt', plan.created_at,
        'updatedAt', plan.updated_at,
        'createdBy', plan.created_by
      ),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'itemId', item.id,
          'lineNo', item.line_no,
          'procedureId', item.procedure_id,
          'toothCode', item.tooth_code,
          'description', item.description,
          'estimatedFeeCentavos', item.estimated_fee_centavos::text,
          'createdAt', item.created_at
        ) order by item.line_no, item.id)
        from (
          select source.id, source.line_no, source.procedure_id,
            source.tooth_code, source.description,
            source.estimated_fee_centavos, source.created_at
          from public.treatment_plan_items as source
          where source.organization_id = plan.organization_id
            and source.plan_id = plan.id
          order by source.line_no, source.id
          limit 200
        ) as item
      ), '[]'::jsonb),
      'alternatives', coalesce((
        select jsonb_agg(jsonb_build_object(
          'alternativeId', alternative.id,
          'alternativeNo', alternative.alternative_no,
          'summary', alternative.summary,
          'createdAt', alternative.created_at
        ) order by alternative.alternative_no, alternative.id)
        from (
          select source.id, source.alternative_no, source.summary,
            source.created_at
          from public.treatment_plan_alternatives as source
          where source.organization_id = plan.organization_id
            and source.plan_id = plan.id
          order by source.alternative_no, source.id
          limit 100
        ) as alternative
      ), '[]'::jsonb),
      'discussions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'discussionId', discussion.id,
          'discussedBy', discussion.discussed_by,
          'treatingProviderId', discussion.treating_provider_id,
          'discussedAt', discussion.discussed_at,
          'context', discussion.context,
          'notes', discussion.notes,
          'createdAt', discussion.created_at
        ) order by discussion.discussed_at, discussion.id)
        from (
          select source.id, source.discussed_by,
            source.treating_provider_id, source.discussed_at, source.context,
            source.notes, source.created_at
          from public.treatment_plan_discussions as source
          where source.organization_id = plan.organization_id
            and source.plan_id = plan.id
          order by source.discussed_at, source.id
          limit 200
        ) as discussion
      ), '[]'::jsonb),
      'drawing', (
        select jsonb_build_object(
          'drawingId', drawing.id,
          'drawing', drawing.drawing,
          'updatedBy', drawing.updated_by,
          'updatedAt', drawing.updated_at,
          'version', drawing.version
        )
        from public.treatment_plan_drawings as drawing
        where drawing.organization_id = plan.organization_id
          and drawing.plan_id = plan.id
        limit 1
      )
    )
    from public.treatment_plans as plan
    where plan.id = p_plan_id
      and plan.organization_id = v_organization_id
  );
end;
$$;

revoke all on function public.get_treatment_plan_detail(uuid, uuid)
from public, anon, authenticated, service_role;

create or replace function public.generate_document(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_document_type text,
  p_include_set jsonb default '{}'::jsonb
)
returns table(document_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_include_set jsonb := coalesce(p_include_set, '{}'::jsonb);
  v_snapshot jsonb := '{}'::jsonb;
  v_document_id uuid;
  v_version integer;
  v_plan_id uuid;
  v_plan_patient_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_document_permission_at_branch(
       p_acting_branch_id, 'document.generate'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_document_type not in (
       'PATIENT_RECORD_SUMMARY', 'APPOINTMENT_SLIP', 'REFERRAL_LETTER',
       'TREATMENT_PLAN'
     )
     or jsonb_typeof(v_include_set) <> 'object'
     or (p_document_type <> 'TREATMENT_PLAN' and exists (
       select 1
       from jsonb_object_keys(v_include_set) as key
       where jsonb_typeof(v_include_set -> key) <> 'boolean'
     ))
     or (p_document_type = 'TREATMENT_PLAN' and (
       not (v_include_set ? 'planId')
       or jsonb_typeof(v_include_set -> 'planId') <> 'string'
       or not (v_include_set ->> 'planId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
     ))
     or (p_document_type = 'TREATMENT_PLAN' and exists (
       select 1
       from jsonb_object_keys(v_include_set) as key
       where key not in ('planId', 'items', 'alternatives', 'discussions', 'drawing')
          or (key <> 'planId' and jsonb_typeof(v_include_set -> key) <> 'boolean')
     ))
     or (p_document_type = 'PATIENT_RECORD_SUMMARY' and exists (
       select 1
       from jsonb_object_keys(v_include_set) as key
       where key not in ('demographics', 'referrals', 'appointments')
     ))
     or (p_document_type = 'APPOINTMENT_SLIP' and exists (
       select 1
       from jsonb_object_keys(v_include_set) as key
       where key not in ('demographics', 'appointments')
     ))
     or (p_document_type = 'REFERRAL_LETTER' and exists (
       select 1
       from jsonb_object_keys(v_include_set) as key
       where key not in ('demographics', 'referrals')
     )) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.patients as patient
    where patient.organization_id = v_organization_id
      and patient.id = p_patient_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_document_type = 'TREATMENT_PLAN' then
    select plan.id, plan.patient_id into v_plan_id, v_plan_patient_id
    from public.treatment_plans as plan
    where plan.id = (v_include_set ->> 'planId')::uuid
      and plan.organization_id = v_organization_id;

    if v_plan_id is null
       or v_plan_patient_id is null
       or v_plan_patient_id <> p_patient_id then
      raise insufficient_privilege using message = 'not authorized';
    end if;
  end if;

  if v_include_set ? 'demographics' then
    v_snapshot := v_snapshot || jsonb_build_object(
      'demographics', (
        select jsonb_build_object(
          'patientId', patient.id,
          'patientNumber', patient.patient_number,
          'firstName', patient.first_name,
          'middleName', patient.middle_name,
          'lastName', patient.last_name,
          'suffix', patient.suffix,
          'preferredName', patient.preferred_name,
          'birthDate', patient.birth_date,
          'sexAtRegistration', patient.sex_at_registration,
          'addressLine1', patient.address_line1,
          'addressLine2', patient.address_line2,
          'city', patient.city,
          'province', patient.province,
          'postalCode', patient.postal_code,
          'status', patient.status,
          'contacts', coalesce((
            select jsonb_agg(jsonb_build_object(
              'contactType', contact.contact_type,
              'label', contact.label,
              'value', contact.value,
              'isPrimary', contact.is_primary
            ) order by contact.is_primary desc, contact.created_at, contact.id)
            from (
              select source.id, source.contact_type, source.label,
                source.value, source.is_primary, source.created_at
              from public.patient_contacts as source
              where source.organization_id = patient.organization_id
                and source.patient_id = patient.id
                and source.status = 'active'
              order by source.is_primary desc, source.created_at, source.id
              limit 50
            ) as contact
          ), '[]'::jsonb)
        )
        from public.patients as patient
        where patient.organization_id = v_organization_id
          and patient.id = p_patient_id
      )
    );
  end if;

  if v_include_set ? 'referrals' then
    v_snapshot := v_snapshot || jsonb_build_object(
      'referrals', coalesce((
        select jsonb_agg(jsonb_build_object(
          'direction', referral.direction,
          'status', referral.status,
          'requiredSpecialtyName', referral.required_specialty_name,
          'externalPartyName', referral.external_party_name,
          'externalPartyOrganization', referral.external_party_organization,
          'externalPartyContact', referral.external_party_contact,
          'notes', referral.notes,
          'createdAt', referral.created_at
        ) order by referral.created_at desc, referral.id)
        from (
          select source.id, source.direction, source.status,
            specialty.name as required_specialty_name,
            source.external_party_name, source.external_party_organization,
            source.external_party_contact, source.notes, source.created_at
          from public.patient_referrals as source
          left join public.specialties as specialty
            on specialty.id = source.required_specialty_id
          where source.org_id = v_organization_id
            and source.patient_id = p_patient_id
          order by source.created_at desc, source.id
          limit 100
        ) as referral
      ), '[]'::jsonb)
    );
  end if;

  if v_include_set ? 'appointments' then
    v_snapshot := v_snapshot || jsonb_build_object(
      'appointments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'appointmentId', appointment.id,
          'branchId', appointment.branch_id,
          'startsAt', appointment.starts_at,
          'endsAt', appointment.ends_at,
          'schedulingStatus', appointment.scheduling_status,
          'confirmationStatus', appointment.confirmation_status,
          'encounterStatus', appointment.encounter_status,
          'title', appointment.title,
          'createdAt', appointment.created_at
        ) order by appointment.starts_at desc, appointment.id)
        from (
          select source.id, source.branch_id, source.starts_at,
            source.ends_at, source.scheduling_status,
            source.confirmation_status, source.encounter_status,
            source.title, source.created_at
          from public.appointments as source
          where source.organization_id = v_organization_id
            and source.patient_id = p_patient_id
            and source.branch_id = p_acting_branch_id
          order by source.starts_at desc, source.id
          limit 200
        ) as appointment
      ), '[]'::jsonb)
    );
  end if;

  if p_document_type = 'TREATMENT_PLAN' then
    v_snapshot := v_snapshot || jsonb_build_object(
      'plan', (
        select jsonb_build_object(
          'planId', plan.id,
          'patientId', plan.patient_id,
          'title', plan.title,
          'status', plan.status,
          'version', plan.version,
          'createdAt', plan.created_at,
          'updatedAt', plan.updated_at,
          'createdBy', plan.created_by
        )
        from public.treatment_plans as plan
        where plan.id = v_plan_id
      )
    );

    if v_include_set ? 'items' then
      v_snapshot := v_snapshot || jsonb_build_object(
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'itemId', item.id,
            'lineNo', item.line_no,
            'procedureId', item.procedure_id,
            'toothCode', item.tooth_code,
            'description', item.description,
            'estimatedFeeCentavos', item.estimated_fee_centavos::text,
            'createdAt', item.created_at
          ) order by item.line_no, item.id)
          from (
            select source.id, source.line_no, source.procedure_id,
              source.tooth_code, source.description,
              source.estimated_fee_centavos, source.created_at
            from public.treatment_plan_items as source
            where source.organization_id = v_organization_id
              and source.plan_id = v_plan_id
            order by source.line_no, source.id
            limit 200
          ) as item
        ), '[]'::jsonb)
      );
    end if;

    if v_include_set ? 'alternatives' then
      v_snapshot := v_snapshot || jsonb_build_object(
        'alternatives', coalesce((
          select jsonb_agg(jsonb_build_object(
            'alternativeId', alternative.id,
            'alternativeNo', alternative.alternative_no,
            'summary', alternative.summary,
            'createdAt', alternative.created_at
          ) order by alternative.alternative_no, alternative.id)
          from (
            select source.id, source.alternative_no, source.summary,
              source.created_at
            from public.treatment_plan_alternatives as source
            where source.organization_id = v_organization_id
              and source.plan_id = v_plan_id
            order by source.alternative_no, source.id
            limit 100
          ) as alternative
        ), '[]'::jsonb)
      );
    end if;

    if v_include_set ? 'discussions' then
      v_snapshot := v_snapshot || jsonb_build_object(
        'discussions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'discussionId', discussion.id,
            'discussedBy', discussion.discussed_by,
            'treatingProviderId', discussion.treating_provider_id,
            'discussedAt', discussion.discussed_at,
            'context', discussion.context,
            'createdAt', discussion.created_at
          ) order by discussion.discussed_at, discussion.id)
          from (
            select source.id, source.discussed_by,
              source.treating_provider_id, source.discussed_at,
              source.context, source.created_at
            from public.treatment_plan_discussions as source
            where source.organization_id = v_organization_id
              and source.plan_id = v_plan_id
            order by source.discussed_at, source.id
            limit 200
          ) as discussion
        ), '[]'::jsonb)
      );
    end if;

    if v_include_set ? 'drawing' then
      v_snapshot := v_snapshot || jsonb_build_object(
        'drawing', (
          select jsonb_build_object(
            'drawingId', drawing.id,
            'drawing', drawing.drawing,
            'updatedBy', drawing.updated_by,
            'updatedAt', drawing.updated_at,
            'version', drawing.version
          )
          from public.treatment_plan_drawings as drawing
          where drawing.organization_id = v_organization_id
            and drawing.plan_id = v_plan_id
          limit 1
        )
      );
    end if;
  end if;

  insert into public.documents (
    organization_id, branch_id, patient_id, document_type, template_version,
    data_snapshot, include_set, status, generated_by, generated_at
  ) values (
    v_organization_id, p_acting_branch_id, p_patient_id, p_document_type,
    'v1', v_snapshot, v_include_set, 'GENERATED', v_actor_user_id,
    pg_catalog.statement_timestamp()
  )
  returning id, public.documents.version into v_document_id, v_version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'DOCUMENT',
    'document.generated', 'document', v_document_id, p_patient_id, 'SUCCESS',
    jsonb_build_object('document_type', p_document_type, 'include_set', v_include_set)
  );

  document_id := v_document_id;
  version := v_version;
  return next;
end;
$$;

revoke all on function public.generate_document(uuid, uuid, text, jsonb)
from public, anon, authenticated, service_role;

grant execute on function public.get_treatment_plan_detail(uuid, uuid)
to authenticated;
grant execute on function public.generate_document(uuid, uuid, text, jsonb)
to authenticated;

comment on function public.get_treatment_plan_detail(uuid, uuid) is
  'Deterministically bounded same-tenant treatment-plan detail under clinical.read; estimate values are returned only as base-10 centavo strings.';
comment on function public.generate_document(uuid, uuid, text, jsonb) is
  'Generates one immutable deterministically bounded document snapshot and audit event under document.generate; treatment-plan estimates are snapshotted only as base-10 centavo strings.';
