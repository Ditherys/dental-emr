-- O2/O8: renderer-independent procedure cases and structured treatment-plan
-- details. All patient-scoped relationships are organization-qualified. These
-- tables are RPC-owned: RLS is enabled and no browser role has base grants.

alter table public.treatment_plan_items
  add column if not exists priority text,
  add column if not exists sequence_no integer,
  add column if not exists surfaces text[],
  add column if not exists notes text;

update public.treatment_plan_items
set priority = coalesce(priority, 'ROUTINE'),
    sequence_no = coalesce(sequence_no, line_no),
    surfaces = coalesce(surfaces, '{}'::text[])
where priority is null or sequence_no is null or surfaces is null;

alter table public.treatment_plan_items
  alter column priority set default 'ROUTINE',
  alter column priority set not null,
  alter column sequence_no set not null,
  alter column surfaces set default '{}'::text[],
  alter column surfaces set not null;

alter table public.treatment_plan_items
  add constraint treatment_plan_items_priority_check check (priority in ('URGENT','HIGH','ROUTINE','ELECTIVE')),
  add constraint treatment_plan_items_sequence_no_check check (sequence_no between 1 and 999),
  add constraint treatment_plan_items_surfaces_check check (
    cardinality(surfaces) <= 7
    and surfaces <@ array['O','B','L','M','D','I','F']::text[]
  ),
  add constraint treatment_plan_items_notes_bounded_check check (
    notes is null or (pg_catalog.btrim(notes) <> '' and pg_catalog.length(notes) <= 4000)
  );

create index treatment_plan_items_organization_plan_sequence_idx
  on public.treatment_plan_items (organization_id, plan_id, sequence_no, id);

create table public.procedure_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  origin_branch_id uuid not null,
  procedure_id uuid not null,
  treatment_plan_item_id uuid,
  charge_id uuid,
  opened_by uuid not null references auth.users(id) on delete restrict,
  opened_at timestamptz not null default statement_timestamp(),
  status text not null default 'OPEN',
  version integer not null default 1,
  constraint procedure_cases_organization_id_id_key unique (organization_id, id),
  constraint procedure_cases_organization_plan_item_key unique (organization_id, treatment_plan_item_id),
  constraint procedure_cases_organization_charge_key unique (organization_id, charge_id),
  constraint procedure_cases_patient_fk foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  constraint procedure_cases_branch_fk foreign key (organization_id, origin_branch_id)
    references public.branches(organization_id, id) on delete restrict,
  constraint procedure_cases_procedure_fk foreign key (organization_id, procedure_id)
    references public.procedures(organization_id, id) on delete restrict,
  constraint procedure_cases_plan_item_fk foreign key (organization_id, treatment_plan_item_id)
    references public.treatment_plan_items(organization_id, id) on delete restrict,
  constraint procedure_cases_charge_fk foreign key (organization_id, charge_id)
    references public.charges(organization_id, id) on delete restrict,
  constraint procedure_cases_status_check check (status in ('OPEN','COMPLETED','CANCELLED')),
  constraint procedure_cases_version_positive_check check (version > 0)
);

revoke all on table public.procedure_cases from public, anon, authenticated, service_role;
alter table public.procedure_cases enable row level security;
create index procedure_cases_organization_patient_opened_idx
  on public.procedure_cases (organization_id, patient_id, opened_at, id);
create index procedure_cases_organization_charge_idx
  on public.procedure_cases (organization_id, charge_id);

comment on table public.procedure_cases is
  'Tenant-scoped longitudinal procedure case. It joins a patient, origin branch, procedure, optional treatment-plan item and confirmed charge without storing renderer state; no browser policy exists.';

create or replace function private.validate_procedure_case_links()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_patient_id uuid;
begin
  if new.treatment_plan_item_id is not null then
    select plan.patient_id into v_patient_id
    from public.treatment_plan_items as item
    join public.treatment_plans as plan
      on plan.organization_id = item.organization_id and plan.id = item.plan_id
    where item.organization_id = new.organization_id and item.id = new.treatment_plan_item_id;
    if v_patient_id is distinct from new.patient_id then
      raise exception using errcode = '23514', message = 'procedure case plan item must belong to the case patient';
    end if;
  end if;

  if new.charge_id is not null then
    select charge.patient_id into v_patient_id
    from public.charges as charge
    where charge.organization_id = new.organization_id and charge.id = new.charge_id;
    if v_patient_id is distinct from new.patient_id then
      raise exception using errcode = '23514', message = 'procedure case charge must belong to the case patient';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.validate_procedure_case_links() from public, anon, authenticated, service_role;
create trigger procedure_cases_validate_links
before insert or update of organization_id, patient_id, treatment_plan_item_id, charge_id on public.procedure_cases
for each row execute function private.validate_procedure_case_links();

create table public.procedure_case_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  procedure_case_id uuid not null,
  event_type text not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default statement_timestamp(),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  reason text,
  notes text,
  correction_of_event_id uuid,
  constraint procedure_case_events_organization_id_id_key unique (organization_id, id),
  constraint procedure_case_events_case_fk foreign key (organization_id, procedure_case_id)
    references public.procedure_cases(organization_id, id) on delete restrict,
  constraint procedure_case_events_correction_fk foreign key (organization_id, correction_of_event_id)
    references public.procedure_case_events(organization_id, id) on delete restrict,
  constraint procedure_case_events_type_check check (event_type in ('TREATMENT','FOLLOW_UP','COMPLETION','CANCELLATION','CORRECTION')),
  constraint procedure_case_events_reason_check check (
    (event_type <> 'CORRECTION' or (reason is not null and pg_catalog.btrim(reason) <> ''))
    and (reason is null or pg_catalog.length(reason) <= 500)
  ),
  constraint procedure_case_events_notes_check check (notes is null or pg_catalog.length(notes) <= 4000),
  constraint procedure_case_events_correction_check check (
    (event_type = 'CORRECTION') = (correction_of_event_id is not null)
  )
);

revoke all on table public.procedure_case_events from public, anon, authenticated, service_role;
alter table public.procedure_case_events enable row level security;
create index procedure_case_events_organization_case_occurred_idx
  on public.procedure_case_events (organization_id, procedure_case_id, occurred_at, id);

comment on table public.procedure_case_events is
  'Append-only event history for treatment, adjustment/follow-up, completion, cancellation, and correction in a procedure case; no browser policy exists.';

create or replace function private.reject_procedure_case_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = 'procedure_case_events are append-only';
end;
$$;
revoke all on function private.reject_procedure_case_event_mutation() from public, anon, authenticated, service_role;
create trigger procedure_case_events_no_update_delete
before update or delete on public.procedure_case_events
for each row execute function private.reject_procedure_case_event_mutation();

create or replace function public.get_treatment_plan_detail(p_acting_branch_id uuid, p_plan_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_organization_id uuid;
begin
  select organization_id into v_organization_id from public.branches where id=p_acting_branch_id and status='active';
  if v_organization_id is null or (select auth.uid()) is null or not private.has_clinical_permission_at_branch(p_acting_branch_id,'patient.clinical.read')
     or not exists(select 1 from public.treatment_plans where id=p_plan_id and organization_id=v_organization_id) then
    raise insufficient_privilege using message='not authorized';
  end if;
  return (select jsonb_build_object('plan',jsonb_build_object('planId',plan.id,'patientId',plan.patient_id,'title',plan.title,'status',plan.status,'version',plan.version,'createdAt',plan.created_at,'updatedAt',plan.updated_at,'createdBy',plan.created_by),'items',coalesce((select jsonb_agg(jsonb_build_object('itemId',item.id,'lineNo',item.line_no,'procedureId',item.procedure_id,'toothCode',item.tooth_code,'description',item.description,'estimatedFeeCentavos',item.estimated_fee_centavos::text,'priority',item.priority,'sequenceNo',item.sequence_no,'surfaces',item.surfaces,'notes',item.notes,'procedureCaseId',case_link.id,'createdAt',item.created_at) order by item.sequence_no,item.line_no,item.id) from (select * from public.treatment_plan_items where organization_id=plan.organization_id and plan_id=plan.id order by sequence_no,line_no,id limit 200) item left join public.procedure_cases case_link on case_link.organization_id=item.organization_id and case_link.treatment_plan_item_id=item.id),'[]'::jsonb),'alternatives',coalesce((select jsonb_agg(jsonb_build_object('alternativeId',alternative.id,'alternativeNo',alternative.alternative_no,'summary',alternative.summary,'createdAt',alternative.created_at) order by alternative.alternative_no,alternative.id) from (select * from public.treatment_plan_alternatives where organization_id=plan.organization_id and plan_id=plan.id order by alternative_no,id limit 100) alternative),'[]'::jsonb),'discussions',coalesce((select jsonb_agg(jsonb_build_object('discussionId',discussion.id,'discussedBy',discussion.discussed_by,'treatingProviderId',discussion.treating_provider_id,'discussedAt',discussion.discussed_at,'context',discussion.context,'notes',discussion.notes,'createdAt',discussion.created_at) order by discussion.discussed_at,discussion.id) from (select * from public.treatment_plan_discussions where organization_id=plan.organization_id and plan_id=plan.id order by discussed_at,id limit 200) discussion),'[]'::jsonb),'drawing',(select jsonb_build_object('drawingId',drawing.id,'drawing',drawing.drawing,'updatedBy',drawing.updated_by,'updatedAt',drawing.updated_at,'version',drawing.version) from public.treatment_plan_drawings drawing where drawing.organization_id=plan.organization_id and drawing.plan_id=plan.id limit 1)) from public.treatment_plans plan where plan.id=p_plan_id and plan.organization_id=v_organization_id);
end;
$$;
revoke all on function public.get_treatment_plan_detail(uuid,uuid) from public, anon, authenticated, service_role;
