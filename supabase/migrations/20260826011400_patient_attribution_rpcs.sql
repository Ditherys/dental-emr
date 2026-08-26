-- P5-03: bounded attribution creation/update and detail projection. The existing
-- create_patient call shape remains intact as an exact historical overload. The
-- attribution overload requires an explicit final document because PostgreSQL
-- otherwise makes untyped legacy RPC calls ambiguous between the two signatures.

create or replace function public.create_patient(
  p_acting_branch_id uuid,
  p_first_name text,
  p_middle_name text,
  p_last_name text,
  p_suffix text,
  p_preferred_name text,
  p_birth_date date,
  p_sex_at_registration text,
  p_address_line1 text,
  p_address_line2 text,
  p_city text,
  p_province text,
  p_postal_code text,
  p_preferred_branch_id uuid,
  p_initial_mobile text,
  p_initial_email text,
  p_duplicate_confirmed boolean,
  p_attribution jsonb
)
returns table(patient_id uuid, version integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_mobile text;
  v_email text;
  v_duplicate_review jsonb;
  v_patient_number text;
  v_source_id uuid;
  v_referrer_id uuid;
  v_external_name text;
  v_external_organization text;
  v_external_contact text;
  v_channel_code text;
begin
  select branch.organization_id into v_organization_id from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';
  if v_organization_id is null or v_actor_user_id is null or not private.has_patient_permission_at_branch(p_acting_branch_id, 'patient.demographics.write') then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if p_first_name is null or pg_catalog.btrim(p_first_name) = '' or pg_catalog.length(p_first_name) > 120 or private.normalize_patient_name(p_first_name) is null
    or p_last_name is null or pg_catalog.btrim(p_last_name) = '' or pg_catalog.length(p_last_name) > 120 or private.normalize_patient_name(p_last_name) is null
    or p_birth_date is null or p_birth_date < date '1900-01-01' or p_birth_date > current_date or p_duplicate_confirmed is null
    or coalesce(pg_catalog.length(p_middle_name), 0) > 120 or coalesce(pg_catalog.length(p_suffix), 0) > 40 or coalesce(pg_catalog.length(p_preferred_name), 0) > 120
    or coalesce(pg_catalog.length(p_address_line1), 0) > 160 or coalesce(pg_catalog.length(p_address_line2), 0) > 160 or coalesce(pg_catalog.length(p_city), 0) > 100
    or coalesce(pg_catalog.length(p_province), 0) > 100 or coalesce(pg_catalog.length(p_postal_code), 0) > 20
    or (p_sex_at_registration is not null and p_sex_at_registration not in ('female', 'male', 'intersex', 'unknown', 'not_recorded')) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;
  if p_attribution is not null then
    if jsonb_typeof(p_attribution) <> 'object' or exists (select 1 from jsonb_object_keys(p_attribution) as key where key not in ('acquisitionSourceId', 'referrerPatientId', 'externalReferrerName', 'externalReferrerOrganization', 'externalReferrerContact', 'initialBookingChannelCode'))
      or p_attribution ?| array['organizationId', 'actorUserId', 'auditAction', 'version', 'patientId', 'id'] then raise invalid_parameter_value using message = 'invalid input'; end if;
    if (p_attribution ? 'acquisitionSourceId' and jsonb_typeof(p_attribution -> 'acquisitionSourceId') not in ('string', 'null'))
      or (p_attribution ? 'referrerPatientId' and jsonb_typeof(p_attribution -> 'referrerPatientId') not in ('string', 'null'))
      or (p_attribution ? 'externalReferrerName' and jsonb_typeof(p_attribution -> 'externalReferrerName') not in ('string', 'null'))
      or (p_attribution ? 'externalReferrerOrganization' and jsonb_typeof(p_attribution -> 'externalReferrerOrganization') not in ('string', 'null'))
      or (p_attribution ? 'externalReferrerContact' and jsonb_typeof(p_attribution -> 'externalReferrerContact') not in ('string', 'null'))
      or (p_attribution ? 'initialBookingChannelCode' and jsonb_typeof(p_attribution -> 'initialBookingChannelCode') not in ('string', 'null')) then raise invalid_parameter_value using message = 'invalid input'; end if;
    begin
      v_source_id := nullif(p_attribution ->> 'acquisitionSourceId', '')::uuid;
      v_referrer_id := nullif(p_attribution ->> 'referrerPatientId', '')::uuid;
    exception when others then raise invalid_parameter_value using message = 'invalid input'; end;
    v_external_name := nullif(pg_catalog.btrim(p_attribution ->> 'externalReferrerName'), '');
    v_external_organization := nullif(pg_catalog.btrim(p_attribution ->> 'externalReferrerOrganization'), '');
    v_external_contact := nullif(pg_catalog.btrim(p_attribution ->> 'externalReferrerContact'), '');
    v_channel_code := nullif(pg_catalog.btrim(p_attribution ->> 'initialBookingChannelCode'), '');
    if coalesce(pg_catalog.length(v_external_name), 0) > 160 or coalesce(pg_catalog.length(v_external_organization), 0) > 160 or coalesce(pg_catalog.length(v_external_contact), 0) > 200
      or (v_channel_code is not null and (v_channel_code <> pg_catalog.upper(v_channel_code) or v_channel_code !~ '^[A-Z][A-Z0-9_]*$' or pg_catalog.length(v_channel_code) > 80)) then raise invalid_parameter_value using message = 'invalid input'; end if;
    if v_source_id is not null and not exists (select 1 from public.acquisition_sources as source where source.id = v_source_id and source.is_active and (source.organization_id is null or source.organization_id = v_organization_id) for share) then raise invalid_parameter_value using message = 'invalid input'; end if;
    if v_channel_code is not null and not exists (select 1 from public.booking_channels as channel where channel.code = v_channel_code and channel.is_active for share) then raise invalid_parameter_value using message = 'invalid input'; end if;
    if v_referrer_id is not null and not exists (select 1 from public.patients as referrer where referrer.id = v_referrer_id and referrer.organization_id = v_organization_id) then raise invalid_parameter_value using message = 'invalid input'; end if;
  end if;
  if v_referrer_id is not null and v_external_name is not null then raise invalid_parameter_value using message = 'invalid input'; end if;
  if p_initial_mobile is not null then v_mobile := private.normalize_patient_mobile(p_initial_mobile); if v_mobile is null then raise invalid_parameter_value using message = 'invalid input'; end if; end if;
  if p_initial_email is not null then v_email := private.normalize_patient_email(p_initial_email); if v_email is null then raise invalid_parameter_value using message = 'invalid input'; end if; end if;
  if p_preferred_branch_id is not null then
    if not exists (select 1 from public.branches as branch where branch.id = p_preferred_branch_id and branch.organization_id = v_organization_id and branch.status = 'active') then raise invalid_parameter_value using message = 'invalid input'; end if;
    if p_preferred_branch_id <> p_acting_branch_id and not private.has_patient_permission_at_branch(p_preferred_branch_id, 'patient.demographics.write') then raise insufficient_privilege using message = 'not authorized'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_organization_id::text, 1));
  v_duplicate_review := private.patient_duplicate_review(v_organization_id, p_first_name, p_last_name, p_birth_date, v_mobile, v_email);
  if not p_duplicate_confirmed and jsonb_array_length(v_duplicate_review -> 'candidates') > 0 then raise exception using errcode = 'P0001', message = 'duplicate review required'; end if;
  insert into private.patient_number_counters (organization_id, last_number) values (v_organization_id, 1) on conflict (organization_id) do update set last_number = private.patient_number_counters.last_number + 1 returning 'P-' || pg_catalog.lpad(last_number::text, 6, '0') into v_patient_number;
  insert into public.patients (organization_id, patient_number, first_name, middle_name, last_name, suffix, preferred_name, birth_date, sex_at_registration, address_line1, address_line2, city, province, postal_code, preferred_branch_id, created_by_user_id, acquisition_source_id, referrer_patient_id, external_referrer_name, external_referrer_organization, external_referrer_contact, initial_booking_channel_code)
  values (v_organization_id, v_patient_number, pg_catalog.btrim(p_first_name), nullif(pg_catalog.btrim(p_middle_name), ''), pg_catalog.btrim(p_last_name), nullif(pg_catalog.btrim(p_suffix), ''), nullif(pg_catalog.btrim(p_preferred_name), ''), p_birth_date, p_sex_at_registration, nullif(pg_catalog.btrim(p_address_line1), ''), nullif(pg_catalog.btrim(p_address_line2), ''), nullif(pg_catalog.btrim(p_city), ''), nullif(pg_catalog.btrim(p_province), ''), nullif(pg_catalog.btrim(p_postal_code), ''), p_preferred_branch_id, v_actor_user_id, v_source_id, v_referrer_id, v_external_name, v_external_organization, v_external_contact, v_channel_code)
  returning id, public.patients.version into patient_id, version;
  if p_initial_mobile is not null then insert into public.patient_contacts (organization_id, patient_id, contact_type, value, is_primary) values (v_organization_id, patient_id, 'MOBILE', v_mobile, true); end if;
  if p_initial_email is not null then insert into public.patient_contacts (organization_id, patient_id, contact_type, value, is_primary) values (v_organization_id, patient_id, 'EMAIL', v_email, true); end if;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, patient_id, result) values (v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PATIENT', case when p_duplicate_confirmed and jsonb_array_length(v_duplicate_review -> 'candidates') > 0 then 'patient.created_duplicate_override' else 'patient.created' end, 'patient', patient_id, patient_id, 'SUCCESS');
  return next;
end;
$$;
revoke all on function public.create_patient(uuid, text, text, text, text, text, date, text, text, text, text, text, text, uuid, text, text, boolean, jsonb) from public, anon, authenticated, service_role;

create or replace function public.update_patient_attribution(p_acting_branch_id uuid, p_patient_id uuid, p_expected_version integer, p_attribution jsonb)
returns table(patient_id uuid, version integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_patient public.patients%rowtype;
  v_source_id uuid;
  v_referrer_id uuid;
  v_external_name text;
  v_external_organization text;
  v_external_contact text;
  v_channel_code text;
begin
  select branch.organization_id into v_organization_id from public.branches as branch where branch.id = p_acting_branch_id and branch.status = 'active';
  if v_organization_id is null or v_actor_user_id is null or not private.has_patient_permission_at_branch(p_acting_branch_id, 'patient.demographics.write') then raise insufficient_privilege using message = 'not authorized'; end if;
  if p_expected_version is null or p_expected_version < 1 or jsonb_typeof(p_attribution) <> 'object' or exists (select 1 from jsonb_object_keys(p_attribution) as key where key not in ('acquisitionSourceId', 'referrerPatientId', 'externalReferrerName', 'externalReferrerOrganization', 'externalReferrerContact', 'initialBookingChannelCode')) or p_attribution ?| array['organizationId', 'actorUserId', 'auditAction', 'version', 'patientId', 'id'] then raise invalid_parameter_value using message = 'invalid input'; end if;
  if (p_attribution ? 'acquisitionSourceId' and jsonb_typeof(p_attribution -> 'acquisitionSourceId') not in ('string', 'null')) or (p_attribution ? 'referrerPatientId' and jsonb_typeof(p_attribution -> 'referrerPatientId') not in ('string', 'null')) or (p_attribution ? 'externalReferrerName' and jsonb_typeof(p_attribution -> 'externalReferrerName') not in ('string', 'null')) or (p_attribution ? 'externalReferrerOrganization' and jsonb_typeof(p_attribution -> 'externalReferrerOrganization') not in ('string', 'null')) or (p_attribution ? 'externalReferrerContact' and jsonb_typeof(p_attribution -> 'externalReferrerContact') not in ('string', 'null')) or (p_attribution ? 'initialBookingChannelCode' and jsonb_typeof(p_attribution -> 'initialBookingChannelCode') not in ('string', 'null')) then raise invalid_parameter_value using message = 'invalid input'; end if;
  begin v_source_id := nullif(p_attribution ->> 'acquisitionSourceId', '')::uuid; v_referrer_id := nullif(p_attribution ->> 'referrerPatientId', '')::uuid; exception when others then raise invalid_parameter_value using message = 'invalid input'; end;
  v_external_name := nullif(pg_catalog.btrim(p_attribution ->> 'externalReferrerName'), ''); v_external_organization := nullif(pg_catalog.btrim(p_attribution ->> 'externalReferrerOrganization'), ''); v_external_contact := nullif(pg_catalog.btrim(p_attribution ->> 'externalReferrerContact'), ''); v_channel_code := nullif(pg_catalog.btrim(p_attribution ->> 'initialBookingChannelCode'), '');
  if coalesce(pg_catalog.length(v_external_name), 0) > 160 or coalesce(pg_catalog.length(v_external_organization), 0) > 160 or coalesce(pg_catalog.length(v_external_contact), 0) > 200 or (v_channel_code is not null and (v_channel_code <> pg_catalog.upper(v_channel_code) or v_channel_code !~ '^[A-Z][A-Z0-9_]*$' or pg_catalog.length(v_channel_code) > 80)) or (v_referrer_id is not null and v_external_name is not null) then raise invalid_parameter_value using message = 'invalid input'; end if;
  select patient.* into v_patient from public.patients as patient where patient.id = p_patient_id and patient.organization_id = v_organization_id for update;
  if not found then raise insufficient_privilege using message = 'not authorized'; end if;
  if v_patient.version <> p_expected_version then raise exception using errcode = 'P0001', message = 'stale version'; end if;
  if v_source_id is not null and not exists (select 1 from public.acquisition_sources as source where source.id = v_source_id and source.is_active and (source.organization_id is null or source.organization_id = v_organization_id) for share) then raise invalid_parameter_value using message = 'invalid input'; end if;
  if v_channel_code is not null and not exists (select 1 from public.booking_channels as channel where channel.code = v_channel_code and channel.is_active for share) then raise invalid_parameter_value using message = 'invalid input'; end if;
  if v_referrer_id is not null and not exists (select 1 from public.patients as referrer where referrer.id = v_referrer_id and referrer.organization_id = v_organization_id) then raise invalid_parameter_value using message = 'invalid input'; end if;
  update public.patients set acquisition_source_id = v_source_id, referrer_patient_id = v_referrer_id, external_referrer_name = v_external_name, external_referrer_organization = v_external_organization, external_referrer_contact = v_external_contact, initial_booking_channel_code = v_channel_code, version = v_patient.version + 1 where id = v_patient.id and organization_id = v_organization_id returning id, public.patients.version into patient_id, version;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, patient_id, result, metadata) values (v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PATIENT', 'patient.attribution.updated', 'patient', patient_id, patient_id, 'SUCCESS', '{}'::jsonb);
  return next;
end;
$$;
revoke all on function public.update_patient_attribution(uuid, uuid, integer, jsonb) from public, anon, authenticated, service_role;

create or replace function public.get_patient_detail(p_acting_branch_id uuid, p_patient_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_patient public.patients%rowtype; v_detail jsonb;
begin
  select patient.* into v_patient from public.patients as patient join public.branches as branch on branch.id = p_acting_branch_id and branch.organization_id = patient.organization_id and branch.status = 'active' where patient.id = p_patient_id;
  if not found or (select auth.uid()) is null or not private.has_patient_permission_at_branch(p_acting_branch_id, 'patient.demographics.read') then raise insufficient_privilege using message = 'not authorized'; end if;
  select jsonb_build_object('patientId', v_patient.id, 'patientNumber', v_patient.patient_number, 'firstName', v_patient.first_name, 'middleName', v_patient.middle_name, 'lastName', v_patient.last_name, 'suffix', v_patient.suffix, 'preferredName', v_patient.preferred_name, 'birthDate', v_patient.birth_date, 'sexAtRegistration', v_patient.sex_at_registration, 'addressLine1', v_patient.address_line1, 'addressLine2', v_patient.address_line2, 'city', v_patient.city, 'province', v_patient.province, 'postalCode', v_patient.postal_code, 'preferredBranch', (select jsonb_build_object('branchId', branch.id, 'name', branch.name) from public.branches as branch where branch.organization_id = v_patient.organization_id and branch.id = v_patient.preferred_branch_id), 'status', v_patient.status, 'version', v_patient.version, 'attribution', jsonb_build_object('acquisitionSource', (select jsonb_build_object('code', source.code, 'name', source.name, 'category', source.category) from public.acquisition_sources as source where source.id = v_patient.acquisition_source_id), 'initialBookingChannel', (select jsonb_build_object('code', channel.code, 'name', channel.name) from public.booking_channels as channel where channel.code = v_patient.initial_booking_channel_code), 'referrerPatient', (select jsonb_build_object('patientId', referrer.id, 'displayName', concat_ws(' ', referrer.first_name, referrer.middle_name, referrer.last_name, referrer.suffix)) from public.patients as referrer where referrer.organization_id = v_patient.organization_id and referrer.id = v_patient.referrer_patient_id), 'externalReferrer', jsonb_build_object('name', v_patient.external_referrer_name, 'organization', v_patient.external_referrer_organization, 'contact', v_patient.external_referrer_contact)), 'contacts', coalesce((select jsonb_agg(jsonb_build_object('contactId', contact.id, 'contactType', contact.contact_type, 'label', contact.label, 'value', contact.value, 'isPrimary', contact.is_primary, 'version', contact.version) order by contact.contact_type, contact.id) from public.patient_contacts as contact where contact.organization_id = v_patient.organization_id and contact.patient_id = v_patient.id and contact.status = 'active'), '[]'::jsonb), 'relationships', coalesce((select jsonb_agg(jsonb_build_object('relationshipId', relationship.id, 'relatedPatientId', relationship.related_patient_id, 'relatedPatientDisplayName', case when related_patient.id is null then null else concat_ws(' ', related_patient.first_name, related_patient.middle_name, related_patient.last_name, related_patient.suffix) end, 'externalContactName', relationship.external_contact_name, 'externalMobile', relationship.external_mobile, 'externalEmail', relationship.external_email, 'relationshipType', relationship.relationship_type, 'isLegalGuardian', relationship.is_legal_guardian, 'canReceiveCommunications', relationship.can_receive_communications, 'canConsent', relationship.can_consent, 'version', relationship.version) order by relationship.id) from public.patient_relationships as relationship left join public.patients as related_patient on related_patient.organization_id = relationship.organization_id and related_patient.id = relationship.related_patient_id where relationship.organization_id = v_patient.organization_id and relationship.patient_id = v_patient.id and relationship.status = 'active'), '[]'::jsonb)) into v_detail;
  insert into public.audit_events (organization_id, branch_id, actor_user_id, actor_type, category, action, entity_type, entity_id, patient_id, result) values (v_patient.organization_id, p_acting_branch_id, (select auth.uid()), 'USER', 'PATIENT', 'patient.viewed', 'patient', v_patient.id, v_patient.id, 'SUCCESS');
  return v_detail;
end;
$$;
revoke all on function public.get_patient_detail(uuid, uuid) from public, anon, authenticated, service_role;
