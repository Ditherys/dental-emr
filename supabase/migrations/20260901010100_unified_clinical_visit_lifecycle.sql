-- Unified Clinical Chart workspace, task 1: a managed, race-safe clinical visit
-- lifecycle. This is the single server-side entry point through which every
-- later clinical write obtains its encounter and its provider attribution.
--
-- Forward-only and non-destructive: pre-workspace encounters keep
-- managed_visit = false and clinical_date = null, are never resumed, finalized,
-- reconciled, deleted, or rewritten here, and historical duplicate OPEN rows are
-- left exactly as they are.

alter table public.clinical_encounters
  add column clinical_date date,
  add column managed_visit boolean not null default false;

alter table public.clinical_encounters
  add constraint clinical_encounters_managed_visit_date_check
  check (not managed_visit or clinical_date is not null);

comment on column public.clinical_encounters.clinical_date is
  'Server-derived Philippine (Asia/Manila) calendar date of a managed visit. Null on pre-workspace encounters; never accepted from a client.';

comment on column public.clinical_encounters.managed_visit is
  'True only for encounters opened by public.start_or_resume_clinical_visit. Pre-workspace rows remain false and are never resumed or rewritten by the managed lifecycle.';

-- At most one managed OPEN visit per tenant, branch, patient, provider, and
-- clinical date. Scoped so it can never collide with historical rows.
create unique index clinical_encounters_managed_open_visit_key
  on public.clinical_encounters (
    organization_id,
    branch_id,
    patient_id,
    treating_provider_id,
    clinical_date
  )
  where managed_visit and status = 'OPEN';

create index clinical_encounters_managed_visit_lookup_idx
  on public.clinical_encounters (
    organization_id,
    patient_id,
    branch_id,
    treating_provider_id,
    clinical_date
  );

create function public.start_or_resume_clinical_visit(
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

  -- An explicit request key serializes a duplicated in-flight request on its
  -- own token. It is never an identity: the visit identity below is derived
  -- entirely from server-resolved tenant, branch, patient, provider, and date.
  -- Always taken before the identity lock, so the two can never deadlock.
  if p_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_organization_id::text || ':' || p_idempotency_key::text,
        0
      )
    );
  end if;

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
      -- Belt and braces behind the advisory lock: a concurrent writer that
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

comment on function public.start_or_resume_clinical_visit(uuid, uuid, uuid, uuid) is
  'Opens or resumes the one managed OPEN clinical visit for a same-tenant patient under patient.clinical.write. Organization, actor, treating provider, and the Philippine clinical date are derived on the server; no provider, organization, or date may be supplied by a client. Repeated and concurrent calls converge on one encounter under a transaction-scoped identity lock; only the create path writes an audit event. A finalized visit is never reopened, and pre-workspace encounters are never resumed or rewritten.';
