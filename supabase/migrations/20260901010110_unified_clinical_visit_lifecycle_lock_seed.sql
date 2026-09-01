-- Give the optional request-key lock its own advisory-lock key space.
--
-- Both locks in the managed visit lifecycle previously hashed into seed 0. The
-- deadlock-freedom argument for taking the request-key lock before the identity
-- lock only holds while the two key spaces are disjoint, and with a shared seed
-- that was true by hash luck rather than by construction: a request key whose
-- hash collided with an identity key would let two sessions acquire the same
-- lock value in opposite orders. Seed 1 makes the separation structural, matching
-- 20260825010700_patient_children_write.sql.
--
-- Body is otherwise identical to 20260901010100. Nothing else about the visit
-- contract, authorization, audit behaviour, or historical data changes.

create or replace function public.start_or_resume_clinical_visit(
  p_branch_id uuid,
  p_patient_id uuid,
  p_appointment_id uuid default null,
  p_idempotency_key uuid default null
)
returns table (
  encounter_id uuid,
  clinical_date date,
  status text,
  version integer,
  resumed boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_provider_id uuid;
  v_clinical_date date;
  v_encounter_id uuid;
  v_resumed boolean := true;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_branch_id, 'patient.clinical.write'
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
    v_organization_id, p_branch_id, v_actor_user_id
  );

  if p_appointment_id is not null and not exists (
    select 1
    from public.appointments as appointment
    where appointment.id = p_appointment_id
      and appointment.organization_id = v_organization_id
      and appointment.branch_id = p_branch_id
      and appointment.patient_id = p_patient_id
      and appointment.encounter_status <> 'CANCELLED'
    for key share
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_clinical_date :=
    (pg_catalog.timezone('Asia/Manila', pg_catalog.statement_timestamp()))::date;

  -- Request-key lock: seed 1, a key space disjoint from the identity lock below.
  -- It serializes a duplicated in-flight request on its own token and is never an
  -- identity. Always taken before the identity lock, so ordering is consistent and
  -- the two can never deadlock.
  if p_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_organization_id::text || ':' || p_idempotency_key::text,
        1
      )
    );
  end if;

  -- Identity lock: seed 0, keyed by the server-derived visit identity.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || p_branch_id::text || ':'
        || p_patient_id::text || ':' || v_provider_id::text || ':'
        || v_clinical_date::text,
      0
    )
  );

  select encounter.id into v_encounter_id
  from public.clinical_encounters as encounter
  where encounter.organization_id = v_organization_id
    and encounter.branch_id = p_branch_id
    and encounter.patient_id = p_patient_id
    and encounter.treating_provider_id = v_provider_id
    and encounter.clinical_date = v_clinical_date
    and encounter.managed_visit
    and encounter.status = 'OPEN'
  for no key update;

  if v_encounter_id is null then
    begin
      insert into public.clinical_encounters (
        organization_id, branch_id, patient_id, appointment_id,
        treating_provider_id, status, created_by, clinical_date, managed_visit
      ) values (
        v_organization_id, p_branch_id, p_patient_id, p_appointment_id,
        v_provider_id, 'OPEN', v_actor_user_id, v_clinical_date, true
      ) returning id into v_encounter_id;

      v_resumed := false;
    exception when unique_violation then
      -- Belt and braces behind the identity lock: a concurrent writer that
      -- already committed this visit wins, and this call resumes it.
      select encounter.id into v_encounter_id
      from public.clinical_encounters as encounter
      where encounter.organization_id = v_organization_id
        and encounter.branch_id = p_branch_id
        and encounter.patient_id = p_patient_id
        and encounter.treating_provider_id = v_provider_id
        and encounter.clinical_date = v_clinical_date
        and encounter.managed_visit
        and encounter.status = 'OPEN'
      for no key update;

      if v_encounter_id is null then
        raise;
      end if;
    end;
  end if;

  if not v_resumed then
    insert into public.audit_events (
      organization_id, branch_id, actor_user_id, actor_type, category, action,
      entity_type, entity_id, patient_id, result, metadata
    ) values (
      v_organization_id, p_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
      'clinical.encounter.opened', 'clinical_encounter', v_encounter_id,
      p_patient_id, 'SUCCESS', '{}'::jsonb
    );
  end if;

  return query
  select
    encounter.id,
    encounter.clinical_date,
    encounter.status,
    encounter.version,
    v_resumed
  from public.clinical_encounters as encounter
  where encounter.id = v_encounter_id;
end;
$$;

revoke all on function public.start_or_resume_clinical_visit(uuid, uuid, uuid, uuid)
from public, anon, authenticated, service_role;
