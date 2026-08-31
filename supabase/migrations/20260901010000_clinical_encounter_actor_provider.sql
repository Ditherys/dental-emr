-- O14 follow-up: derive encounter attribution from the authenticated actor.
-- The legacy provider-selectable function remains for historical compatibility,
-- but browser execute is withdrawn by the following grants migration.

create function public.create_clinical_encounter_v2(
  p_acting_branch_id uuid,
  p_patient_id uuid,
  p_appointment_id uuid default null
)
returns table(encounter_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_provider_id uuid;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_acting_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1
    from public.patients as patient
    where patient.id = p_patient_id
      and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_provider_id := private.require_active_actor_provider(
    v_organization_id, p_acting_branch_id, v_actor_user_id
  );

  if p_appointment_id is not null and not exists (
    select 1
    from public.appointments as appointment
    where appointment.id = p_appointment_id
      and appointment.organization_id = v_organization_id
      and appointment.branch_id = p_acting_branch_id
      and appointment.patient_id = p_patient_id
      and appointment.encounter_status <> 'CANCELLED'
    for key share
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  insert into public.clinical_encounters (
    organization_id, branch_id, patient_id, appointment_id,
    treating_provider_id, status, created_by
  ) values (
    v_organization_id, p_acting_branch_id, p_patient_id, p_appointment_id,
    v_provider_id, 'OPEN', v_actor_user_id
  ) returning id, public.clinical_encounters.version into encounter_id, version;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_acting_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.encounter.opened', 'clinical_encounter', encounter_id, p_patient_id,
    'SUCCESS', '{}'::jsonb
  );

  return next;
end;
$$;

revoke all on function public.create_clinical_encounter_v2(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.create_clinical_encounter_v2(uuid, uuid, uuid) is
  'Opens a clinical encounter for a same-tenant patient under clinical.write and attributes it to the signed-in user''s active provider at the acting branch.';
