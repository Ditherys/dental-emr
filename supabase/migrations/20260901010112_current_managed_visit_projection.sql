-- Unified Clinical Chart workspace, task 2: the read-only projection of the
-- current managed clinical visit.
--
-- The workspace shell needs to show which visit it is about to write into. No
-- browser-callable read exposed `clinical_date` or `managed_visit`, so the shell
-- was approximating "today's visit" from `created_at`. That approximation can
-- surface a pre-workspace UNMANAGED encounter, while
-- `start_or_resume_clinical_visit` only ever resumes a MANAGED row — so the
-- visit displayed could differ from the visit written to.
--
-- This projection closes that gap. It is strictly read-only: it opens nothing,
-- changes nothing, and records no audit event. Opening the Clinical workspace
-- still creates no encounter. Legacy unmanaged encounters stay readable and
-- unchanged through `list_clinical_encounters`; they are simply never reported
-- here as the current managed visit.

create function public.get_current_managed_visit(
  p_branch_id uuid,
  p_patient_id uuid
)
returns table (
  encounter_id uuid,
  status text,
  clinical_date date,
  provider_display text,
  version integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_provider_id uuid;
  v_clinical_date date;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(
       p_branch_id, 'patient.clinical.read'
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
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- Same derivation the write lifecycle uses. A visit belongs to the acting
  -- provider, so an actor without an active linked provider at this branch has
  -- no current visit to read and is refused exactly as they are for a write.
  v_provider_id := private.require_active_actor_provider(
    v_organization_id, p_branch_id, v_actor_user_id
  );

  v_clinical_date :=
    (pg_catalog.timezone('Asia/Manila', pg_catalog.statement_timestamp()))::date;

  return query
  select
    encounter.id,
    encounter.status,
    encounter.clinical_date,
    pg_catalog.concat_ws(
      ' ', provider.first_name, provider.middle_name, provider.last_name, provider.suffix
    ),
    encounter.version
  from public.clinical_encounters as encounter
  join public.providers as provider
    on provider.organization_id = encounter.organization_id
   and provider.id = encounter.treating_provider_id
  where encounter.organization_id = v_organization_id
    and encounter.branch_id = p_branch_id
    and encounter.patient_id = p_patient_id
    and encounter.treating_provider_id = v_provider_id
    and encounter.clinical_date = v_clinical_date
    and encounter.managed_visit
  order by (encounter.status = 'OPEN') desc, encounter.created_at desc
  limit 1;
end;
$$;

revoke all on function public.get_current_managed_visit(uuid, uuid)
from public, anon, authenticated, service_role;

comment on function public.get_current_managed_visit(uuid, uuid) is
  'Read-only projection of the one current managed clinical visit for a same-tenant patient at an active acting branch, under patient.clinical.read plus an active linked provider there. Organization, treating provider, and the Philippine clinical date are derived on the server; no organization, provider, actor, provider display name, or date may be supplied by a client. It returns at most one row and no row when no managed visit exists today. It creates nothing, changes nothing, and writes no audit event, so opening the Clinical workspace never opens an encounter. Pre-workspace unmanaged encounters are never reported here and remain readable and unchanged through list_clinical_encounters.';
