-- Forward-only repair: successor-side clinical lineage and event-derived voids.
-- Existing LEGACY_PHASE15 lifecycle values remain untouched and readable.

alter table public.tooth_clinical_entries
  add column supersedes_entry_id uuid;

alter table public.tooth_clinical_entries
  add constraint tooth_clinical_entries_supersedes_entry_self_check
    check (supersedes_entry_id is null or supersedes_entry_id <> id),
  add constraint tooth_clinical_entries_organization_predecessor_fk
    foreign key (organization_id, supersedes_entry_id)
    references public.tooth_clinical_entries(organization_id, id) on delete restrict;

create unique index tooth_clinical_entries_one_successor_idx
  on public.tooth_clinical_entries (organization_id, supersedes_entry_id)
  where supersedes_entry_id is not null;

create index tooth_clinical_entries_organization_predecessor_idx
  on public.tooth_clinical_entries (organization_id, supersedes_entry_id)
  where supersedes_entry_id is not null;

create or replace function private.validate_tooth_clinical_entry_successor()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_predecessor public.tooth_clinical_entries%rowtype;
begin
  if new.supersedes_entry_id is null then
    return new;
  end if;

  select entry.* into v_predecessor
  from public.tooth_clinical_entries as entry
  where entry.organization_id = new.organization_id
    and entry.id = new.supersedes_entry_id
  for update;

  if not found
     or new.provenance <> 'INTERNAL'
     or new.lifecycle <> 'OPEN'
     or v_predecessor.provenance <> 'INTERNAL'
     or v_predecessor.lifecycle <> 'OPEN'
     or v_predecessor.patient_id is distinct from new.patient_id
     or new.version <> v_predecessor.version + 1
     or v_predecessor.superseded_by_entry_id is not null
     or v_predecessor.voided_at is not null
     or exists (
       select 1 from public.tooth_clinical_entry_voids as event
       where event.organization_id = new.organization_id
         and event.entry_id = new.supersedes_entry_id
     ) then
    raise check_violation using message = 'tooth clinical successor lineage is invalid';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_tooth_clinical_entry_successor()
from public, anon, authenticated, service_role;

create trigger tooth_clinical_entries_validate_successor
before insert or update of organization_id, patient_id, lifecycle, provenance,
  supersedes_entry_id, version
on public.tooth_clinical_entries
for each row execute function private.validate_tooth_clinical_entry_successor();

create or replace function private.validate_tooth_clinical_entry_void_event()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_entry public.tooth_clinical_entries%rowtype;
begin
  select entry.* into v_entry
  from public.tooth_clinical_entries as entry
  where entry.organization_id = new.organization_id
    and entry.id = new.entry_id
  for update;

  if not found
     or v_entry.provenance <> 'INTERNAL'
     or v_entry.lifecycle <> 'OPEN'
     or v_entry.superseded_by_entry_id is not null
     or v_entry.voided_at is not null
     or exists (
       select 1 from public.tooth_clinical_entries as successor
       where successor.organization_id = new.organization_id
         and successor.supersedes_entry_id = new.entry_id
     ) then
    raise check_violation using message = 'tooth clinical void lineage is invalid';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_tooth_clinical_entry_void_event()
from public, anon, authenticated, service_role;

create trigger tooth_clinical_entry_voids_validate_lineage
before insert on public.tooth_clinical_entry_voids
for each row execute function private.validate_tooth_clinical_entry_void_event();

create or replace function private.protect_tooth_clinical_entry_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'tooth clinical history is append-only; use a successor or void event';
end;
$$;

revoke all on function private.protect_tooth_clinical_entry_history()
from public, anon, authenticated, service_role;

-- Legacy reconciliation reasons are clinical correction evidence, not optional
-- annotations. Abort before changing the constraint if any persisted row cannot
-- satisfy the stronger contract.
do $$
begin
  if exists (
    select 1
    from public.odontogram_legacy_resolutions
    where reason is null
       or pg_catalog.btrim(reason) = ''
       or pg_catalog.length(pg_catalog.btrim(reason)) > 500
  ) then
    raise exception 'cannot require legacy resolution reason: invalid persisted row exists';
  end if;
end
$$;

update public.odontogram_legacy_resolutions
set reason = pg_catalog.btrim(reason)
where reason is distinct from pg_catalog.btrim(reason);

alter table public.odontogram_legacy_resolutions
  alter column reason set not null,
  drop constraint odontogram_legacy_resolutions_reason_bounded_check,
  add constraint odontogram_legacy_resolutions_reason_required_check check (
    reason = pg_catalog.btrim(reason)
    and reason <> ''
    and pg_catalog.length(reason) <= 500
  );

create or replace function public.amend_tooth_clinical_entry(
  p_acting_branch_id uuid,
  p_entry_id uuid,
  p_expected_version integer,
  p_tooth_code text,
  p_surfaces text[],
  p_notes text
)
returns table(entry_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_actor uuid := (select auth.uid());
  v_old public.tooth_clinical_entries%rowtype;
  v_new uuid;
  v_surface text;
  v_seen text[] := '{}';
  v_notes text;
begin
  select organization_id into v_org
  from public.branches
  where id = p_acting_branch_id and status = 'active';

  if v_org is null or v_actor is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_entry_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or (p_tooth_code is not null and not p_tooth_code ~
       '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$') then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if p_surfaces is not null then
    if cardinality(p_surfaces) < 1 or cardinality(p_surfaces) > 7 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    foreach v_surface in array p_surfaces loop
      if v_surface not in ('O','B','L','M','D','I','F')
         or v_surface = any(v_seen) then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
      v_seen := pg_catalog.array_append(v_seen, v_surface);
    end loop;
  end if;

  v_notes := case when p_notes is null then null else nullif(pg_catalog.btrim(p_notes), '') end;
  if pg_catalog.length(v_notes) > 2000 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select * into v_old
  from public.tooth_clinical_entries
  where organization_id = v_org and id = p_entry_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if v_old.lifecycle <> 'OPEN'
     or v_old.provenance <> 'INTERNAL'
     or v_old.superseded_by_entry_id is not null
     or v_old.voided_at is not null
     or exists (
       select 1 from public.tooth_clinical_entries as successor
       where successor.organization_id = v_org and successor.supersedes_entry_id = v_old.id
     )
     or exists (
       select 1 from public.tooth_clinical_entry_voids as event
       where event.organization_id = v_org and event.entry_id = v_old.id
     ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_old.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  insert into public.tooth_clinical_entries (
    organization_id, patient_id, tooth_code, kind, clinical_code, status,
    lifecycle, provenance, notes, treating_provider_id, encounter_id,
    treatment_plan_item_id, charge_id, effective_at, completed_at, recorded_by,
    recorded_at, supersedes_entry_id, version
  ) values (
    v_org, v_old.patient_id, coalesce(p_tooth_code, v_old.tooth_code),
    v_old.kind, v_old.clinical_code, v_old.status, 'OPEN', 'INTERNAL',
    case when p_notes is null then v_old.notes else v_notes end,
    v_old.treating_provider_id, v_old.encounter_id, v_old.treatment_plan_item_id,
    v_old.charge_id, v_old.effective_at, v_old.completed_at, v_actor,
    statement_timestamp(), v_old.id, v_old.version + 1
  ) returning id into v_new;

  if p_surfaces is null then
    insert into public.tooth_clinical_entry_surfaces (
      organization_id, entry_id, surface, ordinal
    )
    select organization_id, v_new, surface, ordinal
    from public.tooth_clinical_entry_surfaces as predecessor_surface
    where predecessor_surface.organization_id = v_org
      and predecessor_surface.entry_id = v_old.id;
  else
    foreach v_surface in array v_seen loop
      insert into public.tooth_clinical_entry_surfaces (
        organization_id, entry_id, surface, ordinal
      ) values (v_org, v_new, v_surface, 1);
    end loop;
  end if;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_org, p_acting_branch_id, v_actor, 'USER', 'CLINICAL',
    'clinical.tooth_entry.amended', 'tooth_clinical_entry', v_new,
    v_old.patient_id, 'SUCCESS', '{}'::jsonb
  );

  entry_id := v_new;
  version := v_old.version + 1;
  return next;
end;
$$;

revoke all on function public.amend_tooth_clinical_entry(
  uuid, uuid, integer, text, text[], text
) from public, anon, authenticated, service_role;

create or replace function public.void_tooth_clinical_entry(
  p_acting_branch_id uuid,
  p_entry_id uuid,
  p_expected_version integer,
  p_reason text
)
returns table(entry_id uuid, version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_actor uuid := (select auth.uid());
  v_old public.tooth_clinical_entries%rowtype;
  v_reason text;
begin
  select organization_id into v_org
  from public.branches
  where id = p_acting_branch_id and status = 'active';

  if v_org is null or v_actor is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.write'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_reason := nullif(pg_catalog.btrim(p_reason), '');
  if p_entry_id is null
     or p_expected_version is null
     or p_expected_version < 1
     or pg_catalog.length(v_reason) > 500 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select * into v_old
  from public.tooth_clinical_entries
  where organization_id = v_org and id = p_entry_id
  for update;

  if not found then
    raise insufficient_privilege using message = 'not authorized';
  end if;
  if v_old.lifecycle <> 'OPEN'
     or v_old.provenance <> 'INTERNAL'
     or v_old.superseded_by_entry_id is not null
     or v_old.voided_at is not null
     or exists (
       select 1 from public.tooth_clinical_entries as successor
       where successor.organization_id = v_org and successor.supersedes_entry_id = v_old.id
     )
     or exists (
       select 1 from public.tooth_clinical_entry_voids as event
       where event.organization_id = v_org and event.entry_id = v_old.id
     ) then
    raise exception using errcode = 'P0001', message = 'invalid state';
  end if;
  if v_old.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'stale version';
  end if;

  insert into public.tooth_clinical_entry_voids (
    organization_id, entry_id, reason, voided_by
  ) values (v_org, v_old.id, v_reason, v_actor);

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_org, p_acting_branch_id, v_actor, 'USER', 'CLINICAL',
    'clinical.tooth_entry.voided', 'tooth_clinical_entry', v_old.id,
    v_old.patient_id, 'SUCCESS',
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('reason', v_reason))
  );

  entry_id := v_old.id;
  version := v_old.version;
  return next;
end;
$$;

revoke all on function public.void_tooth_clinical_entry(uuid, uuid, integer, text)
from public, anon, authenticated, service_role;

create or replace function public.get_patient_odontogram(
  p_acting_branch_id uuid,
  p_patient_id uuid
)
returns table(entry_id uuid, data jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org
  from public.branches
  where id = p_acting_branch_id and status = 'active';

  if v_org is null or (select auth.uid()) is null
     or not private.has_clinical_permission_at_branch(
       p_acting_branch_id, 'patient.clinical.read'
     ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if p_patient_id is null or not exists (
    select 1 from public.patients
    where organization_id = v_org and id = p_patient_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  return query
  select entry.id,
    pg_catalog.jsonb_build_object(
      'id', entry.id,
      'organization_id', entry.organization_id,
      'patient_id', entry.patient_id,
      'tooth_code', entry.tooth_code,
      'kind', entry.kind,
      'clinical_code', entry.clinical_code,
      'status', entry.status,
      'lifecycle', case
        when entry.lifecycle <> 'OPEN' then entry.lifecycle
        when successor.id is not null then 'SUPERSEDED'
        when void_event.id is not null then 'VOIDED'
        else 'OPEN'
      end,
      'provenance', entry.provenance,
      'notes', entry.notes,
      'version', entry.version,
      'recorded_at', entry.recorded_at,
      'recorded_by', entry.recorded_by,
      'effective_at', entry.effective_at,
      'completed_at', entry.completed_at,
      'voided_at', coalesce(entry.voided_at, void_event.voided_at),
      'void_reason', coalesce(entry.void_reason, void_event.reason),
      'superseded_by_entry_id', coalesce(entry.superseded_by_entry_id, successor.id),
      'supersedes_entry_id', entry.supersedes_entry_id,
      'is_current', entry.lifecycle = 'OPEN'
        and successor.id is null and void_event.id is null,
      'surfaces', coalesce(surfaces.surfaces, '[]'::jsonb)
    )
  from public.tooth_clinical_entries as entry
  left join lateral (
    select clinical.id
    from public.tooth_clinical_entries as clinical
    where clinical.organization_id = entry.organization_id
      and clinical.supersedes_entry_id = entry.id
    limit 1
  ) as successor on true
  left join lateral (
    select event.id, event.reason, event.voided_at
    from public.tooth_clinical_entry_voids as event
    where event.organization_id = entry.organization_id
      and event.entry_id = entry.id
    limit 1
  ) as void_event on true
  left join lateral (
    select pg_catalog.jsonb_agg(surface.surface order by surface.surface) as surfaces
    from public.tooth_clinical_entry_surfaces as surface
    where surface.organization_id = entry.organization_id
      and surface.entry_id = entry.id
  ) as surfaces on true
  where entry.organization_id = v_org
    and entry.patient_id = p_patient_id
  order by entry.tooth_code, entry.recorded_at, entry.id
  limit 200;
end;
$$;

revoke all on function public.get_patient_odontogram(uuid, uuid)
from public, anon, authenticated, service_role;
