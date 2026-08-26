-- P5-05: audited referral lifecycle boundaries. The following grant terminal
-- is the only browser-reachable surface; this migration grants nothing.

create function public.create_patient_referral(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_referral jsonb
)
returns table(referral_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_direction text;
  v_required_specialty_id uuid;
  v_external_party_name text;
  v_external_party_organization text;
  v_external_party_contact text;
  v_notes text;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_patient_permission_at_branch(
       p_acting_branch_id, 'patient.demographics.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null or jsonb_typeof(p_referral) <> 'object'
     or exists (
       select 1 from jsonb_object_keys(p_referral) as key
       where key not in (
         'direction', 'requiredSpecialtyId', 'externalPartyName',
         'externalPartyOrganization', 'externalPartyContact', 'notes'
       )
     )
     or p_referral ?| array['organizationId', 'orgId', 'patientId', 'status', 'version', 'actorUserId', 'auditAction', 'id']
     or not p_referral ? 'direction'
     or jsonb_typeof(p_referral -> 'direction') <> 'string'
     or (p_referral ? 'requiredSpecialtyId' and jsonb_typeof(p_referral -> 'requiredSpecialtyId') not in ('string', 'null'))
     or (p_referral ? 'externalPartyName' and jsonb_typeof(p_referral -> 'externalPartyName') not in ('string', 'null'))
     or (p_referral ? 'externalPartyOrganization' and jsonb_typeof(p_referral -> 'externalPartyOrganization') not in ('string', 'null'))
     or (p_referral ? 'externalPartyContact' and jsonb_typeof(p_referral -> 'externalPartyContact') not in ('string', 'null'))
     or (p_referral ? 'notes' and jsonb_typeof(p_referral -> 'notes') not in ('string', 'null')) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_direction := p_referral ->> 'direction';
  v_external_party_name := nullif(pg_catalog.btrim(p_referral ->> 'externalPartyName'), '');
  v_external_party_organization := nullif(pg_catalog.btrim(p_referral ->> 'externalPartyOrganization'), '');
  v_external_party_contact := nullif(pg_catalog.btrim(p_referral ->> 'externalPartyContact'), '');
  v_notes := nullif(pg_catalog.btrim(p_referral ->> 'notes'), '');

  begin
    v_required_specialty_id := nullif(p_referral ->> 'requiredSpecialtyId', '')::uuid;
  exception when others then
    raise invalid_parameter_value using message = 'invalid input';
  end;

  if v_direction not in ('IN', 'OUT')
     or coalesce(pg_catalog.length(v_external_party_name), 0) > 160
     or coalesce(pg_catalog.length(v_external_party_organization), 0) > 160
     or coalesce(pg_catalog.length(v_external_party_contact), 0) > 200
     or coalesce(pg_catalog.length(v_notes), 0) > 2000 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_required_specialty_id is not null and not exists (
    select 1 from public.specialties as specialty
    where specialty.id = v_required_specialty_id
      and (specialty.organization_id is null or specialty.organization_id = v_organization_id)
    for key share
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.patient_referrals (
    org_id, patient_id, direction, required_specialty_id,
    external_party_name, external_party_organization, external_party_contact, notes
  ) values (
    v_organization_id, p_patient_id, v_direction, v_required_specialty_id,
    v_external_party_name, v_external_party_organization, v_external_party_contact, v_notes
  ) returning id, public.patient_referrals.version into referral_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PATIENT',
    'patient.referral.created', 'patient_referral', referral_id, p_patient_id,
    'SUCCESS', '{}'::jsonb
  );
  return next;
end;
$$;

revoke all on function public.create_patient_referral(uuid, uuid, jsonb)
from public, anon, authenticated, service_role;

create function public.update_patient_referral_status(
  p_acting_branch_id uuid,
  p_referral_id uuid,
  p_expected_version integer,
  p_status text
)
returns table(referral_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_referral public.patient_referrals%rowtype;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_patient_permission_at_branch(
       p_acting_branch_id, 'patient.demographics.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_referral_id is null or p_expected_version is null or p_expected_version < 1
     or p_status not in ('ACTIVE', 'COMPLETED', 'CANCELLED') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select referral.* into v_referral
  from public.patient_referrals as referral
  where referral.id = p_referral_id and referral.org_id = v_organization_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if v_referral.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  if not (
    (v_referral.status = 'RECEIVED' and p_status in ('ACTIVE', 'CANCELLED'))
    or (v_referral.status = 'ACTIVE' and p_status in ('COMPLETED', 'CANCELLED'))
  ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;

  update public.patient_referrals
  set status = p_status, version = v_referral.version + 1
  where id = v_referral.id and org_id = v_organization_id
  returning id, public.patient_referrals.version into referral_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'PATIENT',
    'patient.referral.status_updated', 'patient_referral', referral_id,
    v_referral.patient_id, 'SUCCESS', '{}'::jsonb
  );
  return next;
end;
$$;

revoke all on function public.update_patient_referral_status(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

create function public.list_patient_referrals(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_include_terminal boolean default false
)
returns table(
  referral_id uuid,
  direction text,
  status text,
  required_specialty_id uuid,
  required_specialty_name text,
  external_party_name text,
  external_party_organization text,
  external_party_contact text,
  notes text,
  version integer,
  created_at timestamptz,
  updated_at timestamptz
)
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
     or not private.has_patient_permission_at_branch(
       p_acting_branch_id, 'patient.demographics.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null or p_include_terminal is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id and patient.organization_id = v_organization_id
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select referral.id, referral.direction, referral.status,
    referral.required_specialty_id, specialty.name,
    referral.external_party_name, referral.external_party_organization,
    referral.external_party_contact, referral.notes, referral.version,
    referral.created_at, referral.updated_at
  from public.patient_referrals as referral
  left join public.specialties as specialty on specialty.id = referral.required_specialty_id
  where referral.org_id = v_organization_id
    and referral.patient_id = p_patient_id
    and (p_include_terminal or referral.status not in ('COMPLETED', 'CANCELLED'))
  order by referral.created_at, referral.id
  limit 200;
end;
$$;

revoke all on function public.list_patient_referrals(uuid, uuid, boolean)
from public, anon, authenticated, service_role;
