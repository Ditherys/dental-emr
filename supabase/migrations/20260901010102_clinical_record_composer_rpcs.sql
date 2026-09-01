-- Unified Clinical Chart workspace, task 5: the visit-bound clinical record
-- composer.
--
-- Both functions obtain their encounter from public.start_or_resume_clinical_visit,
-- so a composed clinical record can never exist without a managed visit, a
-- server-derived treating provider, or an audit trail. Organization, actor,
-- provider, encounter and the visit's own clinical date are derived here; the
-- browser supplies route context, the clinical facts, and a request key only.
--
-- Forward-only and non-destructive: no existing row, function body, policy or
-- historical clinical record is rewritten. The superseded direct entry path
-- keeps its definition so existing entries stay explainable, and only loses its
-- browser grant.

create table private.clinical_record_composer_idempotency (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  operation text not null check (operation in ('VISIT_FINDING', 'VISIT_NOTE')),
  idempotency_key uuid not null,
  encounter_id uuid,
  clinical_date date,
  result_count integer,
  note_id uuid,
  note_version integer,
  created_at timestamptz not null default statement_timestamp(),
  primary key (organization_id, actor_user_id, operation, idempotency_key),
  foreign key (organization_id, encounter_id)
    references public.clinical_encounters (organization_id, id) on delete restrict,
  foreign key (organization_id, note_id)
    references public.clinical_notes (organization_id, id) on delete restrict
);

revoke all on table private.clinical_record_composer_idempotency
from public, anon, authenticated, service_role;

comment on table private.clinical_record_composer_idempotency is
  'Actor-scoped request keys for the clinical record composer. A replayed submission returns the stored result instead of recording a second clinical fact. Never readable by a browser role.';

create function public.record_visit_tooth_findings(
  p_branch_id uuid,
  p_patient_id uuid,
  p_tooth_codes text[],
  p_finding_code text,
  p_surfaces text[],
  p_status text,
  p_clinical_date date,
  p_note text,
  p_idempotency_key uuid
)
returns table (
  patient_id uuid,
  encounter_id uuid,
  clinical_date date,
  recorded_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_provider_id uuid;
  v_visit_clinical_date date;
  v_encounter_id uuid;
  v_entry_id uuid;
  v_recorded integer := 0;
  v_note text;
  v_tooth text;
  v_surface text;
  v_seen_teeth text[] := '{}';
  v_seen_surfaces text[] := '{}';
  v_surface_count integer;
  v_occurred_at timestamptz;
  v_stored_encounter uuid;
  v_stored_date date;
  v_stored_count integer;
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

  -- `coalesce`, `nullif` and `any` are SQL constructs resolved by the parser,
  -- not schema-resolved function names, so an empty search_path cannot capture
  -- them. Every genuine function reference below is schema-qualified.
  v_surface_count := coalesce(pg_catalog.array_length(p_surfaces, 1), 0);

  if p_patient_id is null
     or p_idempotency_key is null
     or p_clinical_date is null
     or p_status is distinct from 'ACTIVE'
     or p_finding_code is null
     or p_finding_code not in (
       'CARIES', 'RESTORATION', 'CROWN', 'MISSING', 'SEALANT', 'FRACTURE', 'OTHER'
     )
     or p_tooth_codes is null
     or pg_catalog.array_length(p_tooth_codes, 1) not between 1 and 32
     or p_surfaces is null
     or v_surface_count > 7 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  v_note := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
  if coalesce(pg_catalog.length(v_note), 0) > 2000 then
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

  -- Request lock in its own key space (seed 2), always taken before the managed
  -- visit's request-key lock (seed 1) and identity lock (seed 0). Lock ordering
  -- is therefore structural, so a duplicated in-flight submission serializes
  -- without any possibility of a deadlock against the visit lifecycle.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_actor_user_id::text
        || ':VISIT_FINDING:' || p_idempotency_key::text,
      2
    )
  );

  insert into private.clinical_record_composer_idempotency (
    organization_id, actor_user_id, operation, idempotency_key
  ) values (
    v_organization_id, v_actor_user_id, 'VISIT_FINDING', p_idempotency_key
  ) on conflict do nothing;

  select request.encounter_id, request.clinical_date, request.result_count
    into v_stored_encounter, v_stored_date, v_stored_count
  from private.clinical_record_composer_idempotency as request
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'VISIT_FINDING'
    and request.idempotency_key = p_idempotency_key
  for update;

  if v_stored_encounter is not null then
    patient_id := p_patient_id;
    encounter_id := v_stored_encounter;
    clinical_date := v_stored_date;
    recorded_count := v_stored_count;
    return next;
    return;
  end if;

  foreach v_surface in array p_surfaces loop
    if v_surface is null
       or v_surface not in ('O', 'B', 'L', 'M', 'D', 'I', 'F')
       or v_surface = any(v_seen_surfaces) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_seen_surfaces := pg_catalog.array_append(v_seen_surfaces, v_surface);
  end loop;

  -- A crown or a missing tooth is a whole-tooth fact; every other composer
  -- finding is recorded against at least one surface.
  if p_finding_code in ('CROWN', 'MISSING') then
    if v_surface_count <> 0 then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
  elsif v_surface_count = 0 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  foreach v_tooth in array p_tooth_codes loop
    if v_tooth is null
       or v_tooth !~ '^(1[1-8]|2[1-8]|3[1-8]|4[1-8]|5[1-5]|6[1-5]|7[1-5]|8[1-5])$'
       or v_tooth = any(v_seen_teeth) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    -- The second FDI digit is the position in the arch: 1-3 anterior, 4-8
    -- posterior. An occlusal table exists only on a posterior tooth and an
    -- incisal edge only on an anterior one.
    if pg_catalog.substr(v_tooth, 2, 1) in ('1', '2', '3') then
      if 'O' = any(v_seen_surfaces) then
        raise invalid_parameter_value using message = 'invalid input';
      end if;
    elsif 'I' = any(v_seen_surfaces) then
      raise invalid_parameter_value using message = 'invalid input';
    end if;
    v_seen_teeth := pg_catalog.array_append(v_seen_teeth, v_tooth);
  end loop;

  -- The clinical date bound is re-derived here. A browser value is only ever an
  -- occurrence date at or before today's Philippine clinical date; it can never
  -- move the visit itself, which derives its own date.
  v_visit_clinical_date :=
    (pg_catalog.timezone('Asia/Manila', pg_catalog.statement_timestamp()))::date;
  if p_clinical_date > v_visit_clinical_date
     or p_clinical_date < v_visit_clinical_date - 36525 then
    raise invalid_parameter_value using message = 'invalid input';
  end if;

  select visit.encounter_id into v_encounter_id
  from public.start_or_resume_clinical_visit(
    p_branch_id, p_patient_id, null, p_idempotency_key
  ) as visit;

  if v_encounter_id is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  v_provider_id := private.require_active_actor_provider(
    v_organization_id, p_branch_id, v_actor_user_id
  );

  v_occurred_at :=
    pg_catalog.timezone('Asia/Manila', (p_clinical_date + time '12:00'));

  foreach v_tooth in array v_seen_teeth loop
    insert into public.tooth_clinical_entries (
      organization_id, patient_id, tooth_code, kind, clinical_code, status,
      lifecycle, provenance, notes, recorded_by, recorded_at, effective_at,
      treating_provider_id, encounter_id, version
    ) values (
      v_organization_id, p_patient_id, v_tooth, 'FINDING', p_finding_code,
      p_status, 'OPEN', 'INTERNAL', v_note, v_actor_user_id, v_occurred_at,
      v_occurred_at, v_provider_id, v_encounter_id, 1
    ) returning id into v_entry_id;

    foreach v_surface in array v_seen_surfaces loop
      insert into public.tooth_clinical_entry_surfaces (
        organization_id, entry_id, surface, ordinal
      ) values (v_organization_id, v_entry_id, v_surface, 1);
    end loop;

    insert into public.audit_events (
      organization_id, branch_id, actor_user_id, actor_type, category, action,
      entity_type, entity_id, patient_id, result, metadata
    ) values (
      v_organization_id, p_branch_id, v_actor_user_id, 'USER', 'CLINICAL',
      'clinical.tooth_entry.recorded', 'tooth_clinical_entry', v_entry_id,
      p_patient_id, 'SUCCESS', '{}'::jsonb
    );

    v_recorded := v_recorded + 1;
  end loop;

  update private.clinical_record_composer_idempotency as request
  set encounter_id = v_encounter_id,
      clinical_date = v_visit_clinical_date,
      result_count = v_recorded
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'VISIT_FINDING'
    and request.idempotency_key = p_idempotency_key;

  patient_id := p_patient_id;
  encounter_id := v_encounter_id;
  clinical_date := v_visit_clinical_date;
  recorded_count := v_recorded;
  return next;
end;
$$;

revoke all on function public.record_visit_tooth_findings(
  uuid, uuid, text[], text, text[], text, date, text, uuid
) from public, anon, authenticated, service_role;

comment on function public.record_visit_tooth_findings(
  uuid, uuid, text[], text, text[], text, date, text, uuid
) is
  'The only browser-callable tooth-finding write. It requires live patient.clinical.write at an active acting branch, validates the patient against the derived tenant, obtains its encounter from public.start_or_resume_clinical_visit, and binds every recorded entry to that managed visit and to the treating provider derived by private.require_active_actor_provider. Tooth codes, surface anatomy, whole-tooth versus surface code compatibility, the bounded note, and the Philippine clinical-date bound are all revalidated inside the transaction; a replayed request key returns the original result instead of recording again. Each entry appends one bounded audit event. No organization, provider, actor, encounter or visit date may be supplied by a client.';

create function public.record_visit_clinical_note(
  p_branch_id uuid,
  p_patient_id uuid,
  p_note_type text,
  p_content text,
  p_idempotency_key uuid
)
returns table (
  patient_id uuid,
  encounter_id uuid,
  note_id uuid,
  version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor_user_id uuid := (select auth.uid());
  v_encounter_id uuid;
  v_note_id uuid;
  v_version integer;
  v_content text;
  v_stored_encounter uuid;
  v_stored_note uuid;
  v_stored_version integer;
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

  v_content := pg_catalog.btrim(coalesce(p_content, ''));

  -- AMENDMENT is refused: amending a finalized note stays with the existing
  -- public.amend_clinical_note path, whose rules this function never replaces.
  if p_patient_id is null
     or p_idempotency_key is null
     or p_note_type is null
     or p_note_type not in (
       'PROGRESS', 'CONSULTATION', 'PROCEDURE', 'POST_OP', 'REFERRAL', 'FREE_FORM'
     )
     or v_content = ''
     or pg_catalog.length(v_content) > 4000 then
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_organization_id::text || ':' || v_actor_user_id::text
        || ':VISIT_NOTE:' || p_idempotency_key::text,
      2
    )
  );

  insert into private.clinical_record_composer_idempotency (
    organization_id, actor_user_id, operation, idempotency_key
  ) values (
    v_organization_id, v_actor_user_id, 'VISIT_NOTE', p_idempotency_key
  ) on conflict do nothing;

  select request.encounter_id, request.note_id, request.note_version
    into v_stored_encounter, v_stored_note, v_stored_version
  from private.clinical_record_composer_idempotency as request
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'VISIT_NOTE'
    and request.idempotency_key = p_idempotency_key
  for update;

  if v_stored_note is not null then
    patient_id := p_patient_id;
    encounter_id := v_stored_encounter;
    note_id := v_stored_note;
    version := v_stored_version;
    return next;
    return;
  end if;

  select visit.encounter_id into v_encounter_id
  from public.start_or_resume_clinical_visit(
    p_branch_id, p_patient_id, null, p_idempotency_key
  ) as visit;

  if v_encounter_id is null then
    raise insufficient_privilege using message = 'not authorized';
  end if;

  perform private.require_active_actor_provider(
    v_organization_id, p_branch_id, v_actor_user_id
  );

  -- Reuse the reviewed note-creation boundary rather than a second insert path,
  -- so the DRAFT lifecycle, the finalized-note immutability trigger, and the
  -- existing audit event all keep behaving exactly as they already do.
  select created.note_id, created.version into v_note_id, v_version
  from public.create_clinical_note(
    p_branch_id, v_encounter_id, p_note_type, v_content
  ) as created;

  update private.clinical_record_composer_idempotency as request
  set encounter_id = v_encounter_id,
      note_id = v_note_id,
      note_version = v_version
  where request.organization_id = v_organization_id
    and request.actor_user_id = v_actor_user_id
    and request.operation = 'VISIT_NOTE'
    and request.idempotency_key = p_idempotency_key;

  patient_id := p_patient_id;
  encounter_id := v_encounter_id;
  note_id := v_note_id;
  version := v_version;
  return next;
end;
$$;

revoke all on function public.record_visit_clinical_note(uuid, uuid, text, text, uuid)
from public, anon, authenticated, service_role;

comment on function public.record_visit_clinical_note(uuid, uuid, text, text, uuid) is
  'The only browser-callable visit-note write in the clinical chart workspace. It requires live patient.clinical.write at an active acting branch plus an active linked provider there, validates the patient against the derived tenant, obtains its encounter from public.start_or_resume_clinical_visit, and authors a bounded DRAFT note through the existing public.create_clinical_note boundary so finalized-note immutability and amendment rules are untouched. AMENDMENT is refused. A replayed request key returns the original note instead of authoring a second one. No encounter, organization, provider or actor may be supplied by a client.';

-- The superseded direct entry path could record a finding with neither an
-- encounter nor a treating provider. Its definition is retained so existing
-- entries stay explainable; browser execute is withdrawn.
revoke execute on function public.record_tooth_clinical_entry_v3(
  uuid, uuid, text, text[], text, text, text, jsonb, text, timestamptz, text
) from authenticated;
