-- Unified Clinical Chart workspace, task 7: the visit-bound relationship
-- boundary for bridges and implants.
--
-- Before this migration a bridge or an implant component could only be recorded
-- through public.record_current_bridge_v3 / public.record_current_implant_component_v3,
-- which open no clinical visit, carry no service date, and keep no link to the
-- encounter the work actually happened in. The composer needs all three, so this
-- migration forward-adds the linkage columns and two new provider-free boundaries
-- that obtain their encounter from public.start_or_resume_clinical_visit.
--
-- Forward-only and non-destructive. The new columns are nullable and are never
-- backfilled: a relationship recorded before the workspace existed keeps a null
-- encounter, a null service date and a null note rather than an invented one.
-- No existing row, function body, policy, trigger or grant is rewritten, and the
-- append-only history guards on both relationship tables are untouched — the new
-- boundaries populate the linkage at INSERT time, before the row is sealed, so
-- nothing ever updates a sealed clinical record.

-- ---------------------------------------------------------------------------
-- Forward-added, nullable visit linkage
-- ---------------------------------------------------------------------------

alter table public.dental_bridges
  add column encounter_id uuid,
  add column service_date date,
  add column clinical_note text;

alter table public.dental_bridges
  add constraint dental_bridges_organization_encounter_fk
    foreign key (organization_id, encounter_id)
    references public.clinical_encounters (organization_id, id) on delete restrict,
  add constraint dental_bridges_clinical_note_bounded_check check (
    clinical_note is null
    or (pg_catalog.btrim(clinical_note) <> '' and pg_catalog.length(clinical_note) <= 2000)
  );

create index dental_bridges_organization_encounter_idx
  on public.dental_bridges (organization_id, encounter_id)
  where encounter_id is not null;

comment on column public.dental_bridges.encounter_id is
  'The managed clinical visit this bridge was recorded in. Null for a relationship recorded before the unified clinical chart workspace; never backfilled with an invented encounter.';
comment on column public.dental_bridges.service_date is
  'The Philippine clinical date the bridge was placed, as stated by the treating dentist. Null for a relationship recorded before the workspace existed.';

alter table public.dental_implant_components
  add column encounter_id uuid,
  add column service_date date,
  add column clinical_note text;

alter table public.dental_implant_components
  add constraint dental_implant_components_organization_encounter_fk
    foreign key (organization_id, encounter_id)
    references public.clinical_encounters (organization_id, id) on delete restrict,
  add constraint dental_implant_components_clinical_note_bounded_check check (
    clinical_note is null
    or (pg_catalog.btrim(clinical_note) <> '' and pg_catalog.length(clinical_note) <= 2000)
  );

create index dental_implant_components_organization_encounter_idx
  on public.dental_implant_components (organization_id, encounter_id)
  where encounter_id is not null;

comment on column public.dental_implant_components.encounter_id is
  'The managed clinical visit this component was recorded in. Null for a component recorded before the unified clinical chart workspace; never backfilled with an invented encounter.';
comment on column public.dental_implant_components.service_date is
  'The Philippine clinical date the component was placed, as stated by the treating dentist. Null for a component recorded before the workspace existed.';

-- ---------------------------------------------------------------------------
-- Bridge
-- ---------------------------------------------------------------------------

create function public.record_visit_bridge_v2(
  p_branch_id uuid,
  p_patient_id uuid,
  p_units jsonb,
  p_service_date date,
  p_charge_id uuid,
  p_note text,
  p_idempotency_key text
)
returns table(
  bridge_id uuid, version integer, encounter_id uuid, service_date date, replayed boolean
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
  v_bridge_id uuid;
  v_support_kind text;
  v_note text;
  v_occurred_at timestamptz;
  v_fingerprint text;
  v_stored_fingerprint text;
  v_stored_id uuid;
  v_stored_version integer;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_branch_id and branch.status = 'active';

  -- A bridge is clinical work that references a confirmed charge, so the same
  -- two permissions the reviewed public.record_current_bridge requires are
  -- required here. Nothing is loosened to make the composer reachable.
  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(p_branch_id, 'patient.clinical.write')
     or not private.has_billing_permission_at_branch(p_branch_id, 'billing.charge') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_note := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');

  if p_patient_id is null or p_charge_id is null or p_service_date is null
     or p_units is null or pg_catalog.jsonb_typeof(p_units) <> 'array'
     or pg_catalog.jsonb_array_length(p_units) < 2
     or pg_catalog.jsonb_array_length(p_units) > 16
     or p_idempotency_key is null
     or pg_catalog.length(p_idempotency_key) not between 1 and 128
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or coalesce(pg_catalog.length(v_note), 0) > 2000 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  -- The Philippine clinical date is re-derived here. A browser value may only
  -- ever be a service date at or before today and within the same one-year
  -- backdating window the treatment-event boundary uses.
  v_clinical_date :=
    (pg_catalog.timezone('Asia/Manila', pg_catalog.statement_timestamp()))::date;
  if p_service_date > v_clinical_date or p_service_date < v_clinical_date - 365 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- The browser names a charge that already exists for this patient; it never
  -- posts one here, and a charge belonging to another patient or another tenant
  -- is refused before anything is written.
  if not exists (
    select 1 from public.charges as charge
    where charge.organization_id = v_organization_id
      and charge.id = p_charge_id
      and charge.patient_id = p_patient_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- The reviewed unit validator owns span order, role/support compatibility and
  -- implant-support validity, and derives the canonical support mode. It runs
  -- before the visit is opened so a malformed relationship never starts one.
  v_support_kind := private.validate_bridge_units_payload(
    v_organization_id, p_patient_id, 'CURRENT', null, p_units
  );

  -- Request lock in its own key space (seed 4), taken before the managed
  -- visit's request-key lock (seed 1) and its identity lock (seed 0). Every
  -- caller takes them in that order, so no deadlock cycle is constructible.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_actor_user_id::text || ':' || p_idempotency_key,
      4
    )
  );

  v_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'patient', p_patient_id, 'units', p_units, 'charge', p_charge_id,
      'service_date', p_service_date, 'note', v_note
    )::text
  );

  insert into private.odontogram_revamp_current_idempotency (
    organization_id, actor_user_id, operation, idempotency_key, request_fingerprint
  ) values (
    v_organization_id, v_actor_user_id, 'CURRENT_BRIDGE', p_idempotency_key, v_fingerprint
  ) on conflict do nothing;

  select request.entity_id, request.entity_version, request.request_fingerprint
    into v_stored_id, v_stored_version, v_stored_fingerprint
  from private.odontogram_revamp_current_idempotency as request
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'CURRENT_BRIDGE'
    and request.idempotency_key = p_idempotency_key
  for update;

  -- One request key belongs to exactly one submitted relationship. The browser
  -- derives its key from a hash of the submitted facts, so an edited retry
  -- arrives under a different key; a same-key different-payload request is
  -- refused rather than replayed.
  if v_stored_fingerprint is distinct from v_fingerprint then
    raise exception using errcode = 'P0001', message = 'idempotency conflict';
  end if;

  if v_stored_id is not null then
    select stored.encounter_id, stored.service_date into encounter_id, service_date
    from public.dental_bridges as stored
    where stored.organization_id = v_organization_id and stored.id = v_stored_id;
    bridge_id := v_stored_id;
    version := v_stored_version;
    replayed := true;
    return next;
    return;
  end if;

  select visit.encounter_id into v_encounter_id
  from public.start_or_resume_clinical_visit(
    p_branch_id, p_patient_id, null,
    (pg_catalog.md5('visit-bridge:' || v_organization_id::text || ':'
      || v_actor_user_id::text || ':' || p_idempotency_key))::uuid
  ) as visit;

  if v_encounter_id is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_provider_id := private.require_active_actor_provider(
    v_organization_id, p_branch_id, v_actor_user_id
  );

  v_occurred_at :=
    pg_catalog.timezone('Asia/Manila', (p_service_date + time '12:00'));

  -- The row is inserted unsealed, its units are written, and only then is it
  -- sealed — the one update private.protect_current_bridge_history permits. The
  -- visit linkage is therefore part of the original record rather than a later
  -- rewrite of sealed clinical history.
  insert into public.dental_bridges (
    organization_id, patient_id, record_kind, support_kind, treating_provider_id,
    executed_at, charge_id, encounter_id, service_date, clinical_note,
    recorded_by, version, sealed_at
  ) values (
    v_organization_id, p_patient_id, 'CURRENT', v_support_kind, v_provider_id,
    v_occurred_at, p_charge_id, v_encounter_id, p_service_date, v_note,
    v_actor_user_id, 1, null
  ) returning id into v_bridge_id;

  insert into public.dental_bridge_units (
    organization_id, bridge_id, tooth_fdi, ordinal, role, support_kind, support_component_id
  )
  select v_organization_id, v_bridge_id, unit.tooth_fdi, unit.ordinal, unit.role,
         unit.support_kind, unit.support_component_id
  from pg_catalog.jsonb_to_recordset(p_units)
    as unit(tooth_fdi text, ordinal integer, role text, support_kind text, support_component_id uuid);

  update public.dental_bridges as bridge
  set sealed_at = pg_catalog.statement_timestamp()
  where bridge.organization_id = v_organization_id and bridge.id = v_bridge_id;

  update private.odontogram_revamp_current_idempotency as request
  set entity_id = v_bridge_id, entity_version = 1
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'CURRENT_BRIDGE'
    and request.idempotency_key = p_idempotency_key;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.bridge.current.recorded', 'dental_bridge', v_bridge_id,
    p_patient_id, 'SUCCESS', '{}'::jsonb
  );

  bridge_id := v_bridge_id;
  version := 1;
  encounter_id := v_encounter_id;
  service_date := p_service_date;
  replayed := false;
  return next;
end;
$$;

revoke all on function public.record_visit_bridge_v2(uuid,uuid,jsonb,date,uuid,text,text)
from public, anon, authenticated, service_role;

comment on function public.record_visit_bridge_v2(uuid,uuid,jsonb,date,uuid,text,text) is
  'The visit-bound browser boundary for recording a CURRENT dental bridge. It derives organization, actor, treating provider and the Philippine clinical date on the server, requires live patient.clinical.write and billing.charge at an active acting branch plus an active linked provider there, validates the patient and the named charge against the derived tenant, and revalidates the ordered span, unit roles and implant support through private.validate_bridge_units_payload before opening anything. The encounter comes from public.start_or_resume_clinical_visit, so no bridge exists without a managed visit or an attributable provider, and the visit linkage, the stated service date and the bounded note are written with the original row rather than into sealed history. A replayed request key returns the stored identity; the same key with a different payload is refused. No organization, provider, actor or encounter may be supplied by a client.';

-- ---------------------------------------------------------------------------
-- Implant
-- ---------------------------------------------------------------------------

create function public.record_visit_implant_component_v2(
  p_branch_id uuid,
  p_patient_id uuid,
  p_components jsonb,
  p_service_date date,
  p_charge_id uuid,
  p_note text,
  p_idempotency_key text
)
returns table(
  component_id uuid, version integer, encounter_id uuid, service_date date, replayed boolean
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
  v_chain jsonb;
  v_node jsonb;
  v_ids uuid[] := array[]::uuid[];
  v_component_id uuid;
  v_parent uuid;
  v_index integer;
  v_note text;
  v_occurred_at timestamptz;
  v_fingerprint text;
  v_stored_fingerprint text;
  v_stored_id uuid;
  v_stored_version integer;
begin
  select branch.organization_id into v_organization_id
  from public.branches as branch
  where branch.id = p_branch_id and branch.status = 'active';

  if v_organization_id is null or v_actor_user_id is null
     or not private.has_clinical_permission_at_branch(p_branch_id, 'patient.clinical.write')
     or not private.has_billing_permission_at_branch(p_branch_id, 'billing.charge') then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_note := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');

  if p_patient_id is null or p_charge_id is null or p_service_date is null
     or p_components is null or pg_catalog.jsonb_typeof(p_components) <> 'array'
     or p_idempotency_key is null
     or pg_catalog.length(p_idempotency_key) not between 1 and 128
     or p_idempotency_key <> pg_catalog.btrim(p_idempotency_key)
     or coalesce(pg_catalog.length(v_note), 0) > 2000 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_clinical_date :=
    (pg_catalog.timezone('Asia/Manila', pg_catalog.statement_timestamp()))::date;
  if p_service_date > v_clinical_date or p_service_date < v_clinical_date - 365 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  if not exists (
    select 1 from public.patients as patient
    where patient.id = p_patient_id and patient.organization_id = v_organization_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  if not exists (
    select 1 from public.charges as charge
    where charge.organization_id = v_organization_id
      and charge.id = p_charge_id
      and charge.patient_id = p_patient_id
    for key share
  ) then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  -- The reviewed chain normalizer owns the fixture -> abutment -> crown
  -- dependency rule, the single tooth position, the ordinal sequence and the
  -- attachment vocabulary. It runs before the visit is opened.
  v_chain := private.normalize_implant_chain(p_components);

  -- A pre-existing external placeholder carries no provider, no date and no
  -- charge, so it is not a record of work done at this visit. It keeps the
  -- existing relationship path rather than being forced through this one.
  if exists (
    select 1 from pg_catalog.jsonb_array_elements(v_chain) as node
    where coalesce(node->>'provenance', 'INTERNAL') <> 'INTERNAL'
  ) then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_actor_user_id::text || ':' || p_idempotency_key,
      4
    )
  );

  v_fingerprint := pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'patient', p_patient_id, 'components', v_chain, 'charge', p_charge_id,
      'service_date', p_service_date, 'note', v_note
    )::text
  );

  insert into private.odontogram_revamp_current_idempotency (
    organization_id, actor_user_id, operation, idempotency_key, request_fingerprint
  ) values (
    v_organization_id, v_actor_user_id, 'CURRENT_IMPLANT', p_idempotency_key, v_fingerprint
  ) on conflict do nothing;

  select request.entity_id, request.entity_version, request.request_fingerprint
    into v_stored_id, v_stored_version, v_stored_fingerprint
  from private.odontogram_revamp_current_idempotency as request
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'CURRENT_IMPLANT'
    and request.idempotency_key = p_idempotency_key
  for update;

  if v_stored_fingerprint is distinct from v_fingerprint then
    raise exception using errcode = 'P0001', message = 'idempotency conflict';
  end if;

  if v_stored_id is not null then
    select stored.encounter_id, stored.service_date into encounter_id, service_date
    from public.dental_implant_components as stored
    where stored.organization_id = v_organization_id and stored.id = v_stored_id;
    component_id := v_stored_id;
    version := v_stored_version;
    replayed := true;
    return next;
    return;
  end if;

  select visit.encounter_id into v_encounter_id
  from public.start_or_resume_clinical_visit(
    p_branch_id, p_patient_id, null,
    (pg_catalog.md5('visit-implant:' || v_organization_id::text || ':'
      || v_actor_user_id::text || ':' || p_idempotency_key))::uuid
  ) as visit;

  if v_encounter_id is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_provider_id := private.require_active_actor_provider(
    v_organization_id, p_branch_id, v_actor_user_id
  );

  v_occurred_at :=
    pg_catalog.timezone('Asia/Manila', (p_service_date + time '12:00'));

  for v_index in 1..pg_catalog.jsonb_array_length(v_chain) loop
    v_node := v_chain->(v_index - 1);
    v_parent := case
      when v_node ? 'depends_on_ordinal' then v_ids[(v_node->>'depends_on_ordinal')::integer]
    end;

    insert into public.dental_implant_components (
      organization_id, patient_id, tooth_fdi, ordinal, component_kind,
      attachment_value, depends_on_component_id, record_kind, treating_provider_id,
      executed_at, charge_id, encounter_id, service_date, clinical_note,
      sealed_at, recorded_by, version
    ) values (
      v_organization_id, p_patient_id, v_node->>'tooth_fdi', v_index,
      v_node->>'component_kind', v_node->>'attachment_value', v_parent, 'CURRENT',
      v_provider_id, v_occurred_at, p_charge_id, v_encounter_id, p_service_date,
      v_note, pg_catalog.statement_timestamp(), v_actor_user_id, 1
    ) returning id into v_component_id;

    v_ids := pg_catalog.array_append(v_ids, v_component_id);
  end loop;

  update private.odontogram_revamp_current_idempotency as request
  set entity_id = v_ids[1], entity_version = 1
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'CURRENT_IMPLANT'
    and request.idempotency_key = p_idempotency_key;

  insert into public.audit_events (
    organization_id, branch_id, actor_user_id, actor_type, category, action,
    entity_type, entity_id, patient_id, result, metadata
  ) values (
    v_organization_id, p_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
    'clinical.implant.current.recorded', 'dental_implant_component', v_ids[1],
    p_patient_id, 'SUCCESS',
    pg_catalog.jsonb_build_object('component_count', pg_catalog.array_length(v_ids, 1))
  );

  component_id := v_ids[1];
  version := 1;
  encounter_id := v_encounter_id;
  service_date := p_service_date;
  replayed := false;
  return next;
end;
$$;

revoke all on function public.record_visit_implant_component_v2(uuid,uuid,jsonb,date,uuid,text,text)
from public, anon, authenticated, service_role;

comment on function public.record_visit_implant_component_v2(uuid,uuid,jsonb,date,uuid,text,text) is
  'The visit-bound browser boundary for recording a CURRENT implant chain. It derives organization, actor, treating provider and the Philippine clinical date on the server, requires live patient.clinical.write and billing.charge at an active acting branch plus an active linked provider there, validates the patient and the named charge against the derived tenant, and revalidates the fixture/abutment/crown dependency chain through private.normalize_implant_chain before opening anything. A pre-existing external placeholder is refused because it records no work done at a visit. The encounter comes from public.start_or_resume_clinical_visit, and the visit linkage, the stated service date and the bounded note are written with the original rows. A replayed request key returns the stored identity; the same key with a different payload is refused. No organization, provider, actor or encounter may be supplied by a client.';
