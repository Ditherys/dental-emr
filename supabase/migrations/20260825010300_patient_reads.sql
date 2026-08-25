-- P2-05: bounded patient list/detail reads and atomic record-open audit.
-- This object migration grants nothing.

create or replace function public.search_patients(
  p_acting_branch_id uuid,
  p_query text default null,
  p_birth_date date default null,
  p_status text default null,
  p_sort text default 'name_asc',
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_name_query text;
  v_mobile_query text;
  v_email_query text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or (select auth.uid()) is null
     or not private.has_patient_permission_at_branch(
       p_acting_branch_id, 'patient.demographics.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if coalesce(pg_catalog.length(p_query), 0) > 120
     or (p_birth_date is not null and p_birth_date > current_date)
     or p_status not in ('active', 'inactive', 'archived') and p_status is not null
     or p_sort not in ('name_asc', 'name_desc', 'patient_number_asc', 'updated_desc')
     or p_page is null or p_page < 1
     or p_page_size is null or p_page_size < 1 or p_page_size > 100 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_name_query := private.normalize_patient_name(p_query);
  v_mobile_query := private.normalize_patient_mobile(p_query);
  v_email_query := private.normalize_patient_email(p_query);

  return (
    with matching_patients as (
      select patient.*
      from public.patients as patient
      where patient.organization_id = v_organization_id
        and (p_status is null or patient.status = p_status)
        and (p_birth_date is null or patient.birth_date = p_birth_date)
        and (
          p_query is null
          or (
            coalesce(pg_catalog.length(v_name_query), 0) > 0
            and pg_catalog.strpos(p_query, '%') = 0
            and pg_catalog.strpos(p_query, '_') = 0
            and pg_catalog.strpos(patient.normalized_full_name, v_name_query) > 0
          )
          or pg_catalog.lower(patient.patient_number) = pg_catalog.lower(pg_catalog.btrim(p_query))
          or (v_mobile_query is not null and exists (
            select 1 from public.patient_contacts as contact
            where contact.organization_id = patient.organization_id
              and contact.patient_id = patient.id
              and contact.status = 'active'
              and contact.contact_type = 'MOBILE'
              and contact.normalized_value = v_mobile_query
          ))
          or (v_email_query is not null and exists (
            select 1 from public.patient_contacts as contact
            where contact.organization_id = patient.organization_id
              and contact.patient_id = patient.id
              and contact.status = 'active'
              and contact.contact_type = 'EMAIL'
              and contact.normalized_value = v_email_query
          ))
        )
    ), numbered as (
      select patient.*, count(*) over () as total
      from matching_patients as patient
    ), paged as (
      select numbered.*
      from numbered
      order by
        case when p_sort = 'name_asc' then normalized_last_name end asc,
        case when p_sort = 'name_desc' then normalized_last_name end desc,
        case when p_sort in ('name_asc', 'name_desc') then normalized_first_name end asc,
        case when p_sort = 'patient_number_asc' then patient_number end asc,
        case when p_sort = 'updated_desc' then updated_at end desc,
        patient_number asc,
        id asc
      limit p_page_size offset (p_page - 1) * p_page_size
    )
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(jsonb_build_object(
        'patientId', paged.id,
        'patientNumber', paged.patient_number,
        'displayName', concat_ws(' ', paged.first_name, paged.middle_name, paged.last_name, paged.suffix),
        'birthDate', paged.birth_date,
        'primaryMobile', mobile.value,
        'primaryEmail', email.value,
        'status', paged.status
      )), '[]'::jsonb),
      'total', coalesce(max(paged.total), 0),
      'page', p_page,
      'pageSize', p_page_size
    )
    from paged
    left join lateral (
      select contact.value from public.patient_contacts as contact
      where contact.organization_id = paged.organization_id and contact.patient_id = paged.id
        and contact.contact_type = 'MOBILE' and contact.status = 'active' and contact.is_primary
    ) as mobile on true
    left join lateral (
      select contact.value from public.patient_contacts as contact
      where contact.organization_id = paged.organization_id and contact.patient_id = paged.id
        and contact.contact_type = 'EMAIL' and contact.status = 'active' and contact.is_primary
    ) as email on true
  );
end;
$$;

revoke all on function public.search_patients(uuid, text, date, text, text, integer, integer)
from public, anon, authenticated, service_role;

create or replace function public.get_patient_detail(
  p_acting_branch_id uuid,
  p_patient_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_patient public.patients%rowtype;
  v_detail jsonb;
begin
  select patient.* into v_patient
  from public.patients as patient
  join public.branches as branch
    on branch.id = p_acting_branch_id
   and branch.organization_id = patient.organization_id
   and branch.status = 'active'
  where patient.id = p_patient_id;

  if not found or (select auth.uid()) is null
     or not private.has_patient_permission_at_branch(
       p_acting_branch_id, 'patient.demographics.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  select jsonb_build_object(
    'patientId', v_patient.id,
    'patientNumber', v_patient.patient_number,
    'firstName', v_patient.first_name,
    'middleName', v_patient.middle_name,
    'lastName', v_patient.last_name,
    'suffix', v_patient.suffix,
    'preferredName', v_patient.preferred_name,
    'birthDate', v_patient.birth_date,
    'sexAtRegistration', v_patient.sex_at_registration,
    'addressLine1', v_patient.address_line1,
    'addressLine2', v_patient.address_line2,
    'city', v_patient.city,
    'province', v_patient.province,
    'postalCode', v_patient.postal_code,
    'preferredBranch', (
      select jsonb_build_object('branchId', branch.id, 'name', branch.name)
      from public.branches as branch
      where branch.organization_id = v_patient.organization_id and branch.id = v_patient.preferred_branch_id
    ),
    'status', v_patient.status,
    'version', v_patient.version,
    'contacts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'contactId', contact.id, 'contactType', contact.contact_type, 'label', contact.label,
        'value', contact.value, 'isPrimary', contact.is_primary, 'version', contact.version
      ) order by contact.contact_type, contact.id)
      from public.patient_contacts as contact
      where contact.organization_id = v_patient.organization_id and contact.patient_id = v_patient.id
        and contact.status = 'active'
    ), '[]'::jsonb),
    'relationships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'relationshipId', relationship.id, 'relatedPatientId', relationship.related_patient_id,
        'relatedPatientDisplayName', case when related_patient.id is null then null else concat_ws(' ', related_patient.first_name, related_patient.middle_name, related_patient.last_name, related_patient.suffix) end,
        'externalContactName', relationship.external_contact_name, 'externalMobile', relationship.external_mobile,
        'externalEmail', relationship.external_email, 'relationshipType', relationship.relationship_type,
        'isLegalGuardian', relationship.is_legal_guardian, 'canReceiveCommunications', relationship.can_receive_communications,
        'canConsent', relationship.can_consent, 'version', relationship.version
      ) order by relationship.id)
      from public.patient_relationships as relationship
      left join public.patients as related_patient
        on related_patient.organization_id = relationship.organization_id and related_patient.id = relationship.related_patient_id
      where relationship.organization_id = v_patient.organization_id and relationship.patient_id = v_patient.id
        and relationship.status = 'active'
    ), '[]'::jsonb)
  ) into v_detail;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result
  ) values (
    v_patient.organization_id, p_acting_branch_id, (select auth.uid()), 'USER', 'PATIENT',
    'patient.viewed', 'patient', v_patient.id, v_patient.id, 'SUCCESS'
  );

  return v_detail;
end;
$$;

revoke all on function public.get_patient_detail(uuid, uuid)
from public, anon, authenticated, service_role;
